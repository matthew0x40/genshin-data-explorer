import path from 'path';
import { IMAGEDIR_GENSHIN_EXT } from '../../loadenv.ts';
import fs from 'fs';
import { closeKnex, openPg } from '../../util/db.ts';
import { isInt } from '../../../shared/util/numberUtil.ts';
import { splitCamelcase } from '../../../shared/util/stringUtil.ts';
import { defaultMap } from '../../../shared/util/genericUtil.ts';
import {
  GenshinImageCategoryMap,
  GenshinImageIndexEntity,
  GenshinImageIndexExcelMeta,
  GenshinImageIndexExcelMetaEntry,
} from '../../../shared/types/genshin/genshin-image-index-types.ts';

function getImageNames(): string[] {
  const imageNames: string[] = [];
  for (let fileName of fs.readdirSync(IMAGEDIR_GENSHIN_EXT)) {
    let imageName: string;

    if (fileName.includes('#')) {
      continue;
    } else {
      imageName = fileName.split('.png')[0];
    }
    imageNames.push(imageName);
  }
  return imageNames;
}

export async function indexImages(dryRun: boolean = false) {
  const knex = openPg();

  if (!dryRun) {
    await knex.raw('TRUNCATE TABLE genshin_image_index;').then();
  }

  const imageNameSet: Set<string> = new Set();
  const imageNameToExcelFileUsages: Record<string, string[]> = defaultMap('Array');
  const imageNameToExcelMeta: Record<string, GenshinImageIndexExcelMeta> = defaultMap('Object');

  const catmap: GenshinImageCategoryMap = defaultMap(() =>
    defaultMap(() =>
      defaultMap(() =>
        defaultMap(() =>
          defaultMap(() => null)
        )
      )
    )
  );

  console.log('Gathering image names...');
  for (let imageName of getImageNames()) {
    imageNameSet.add(imageName);
  }

  function findImageUsages(rows: any[]): { images: string[], imagesToExcelMetaEntry: Record<string, GenshinImageIndexExcelMetaEntry> } {
    let images: Set<string> = new Set();
    let imagesToExcelMetaEntry: Record<string, GenshinImageIndexExcelMetaEntry> = defaultMap(() => ({
      usageCount: 0,
      rows: [],
    }));

    for (let i = 0; i < rows.length; i++) {
      let stack = [rows[i]];
      while (stack.length) {
        let obj = stack.shift();

        if (!obj) {
          continue;
        }

        if (typeof obj === 'string') {
          let matchedImageName: string = null;
          if (imageNameSet.has(obj)) {
            images.add(obj);
            matchedImageName = obj;
          } else if (obj.startsWith('ART/')) {
            const objBaseName = path.basename(obj);
            if (imageNameSet.has(objBaseName)) {
              images.add(objBaseName);
              matchedImageName = objBaseName;
            }
          }
          if (matchedImageName) {
            imagesToExcelMetaEntry[matchedImageName].usageCount++;
            imagesToExcelMetaEntry[matchedImageName].rows.push(i);
          }
        }

        if (typeof obj === 'object') {
          if (Array.isArray(obj)) {
            stack.push(... obj);
          } else {
            stack.push(... Object.values(obj));
          }
        }
      }
    }
    return {
      images: Array.from(images),
      imagesToExcelMetaEntry,
    };
  }

  console.log('Computing excel usages...');
  for (let fileName of fs.readdirSync(path.resolve(process.env.GENSHIN_DATA_ROOT, './ExcelBinOutput'))) {
    const json: any[] = JSON.parse(fs.readFileSync(path.resolve(process.env.GENSHIN_DATA_ROOT, './ExcelBinOutput', fileName), 'utf-8'));
    let { images, imagesToExcelMetaEntry } = findImageUsages(json);
    for (let imageName of images) {
      imageNameToExcelFileUsages[imageName].push(fileName);
      imageNameToExcelMeta[imageName][fileName] = imagesToExcelMetaEntry[imageName];
    }
  }

  const batch: GenshinImageIndexEntity[] = [];
  const maxBatchSize: number = 1000;

  async function commitBatch() {
    if (!dryRun) {
      await knex.transaction(function(tx) {
        return knex.batchInsert('genshin_image_index', batch).transacting(tx);
      }).then();
    }
    batch.length = 0;
    console.log('Committed batch');
  }

  console.log('Committing...');
  for (let imageName of getImageNames()) {
    const size: number = fs.statSync(path.resolve(IMAGEDIR_GENSHIN_EXT, `./${imageName}.png`))?.size || 0;
    const cats: string[] = [];

    let catIdx = 0;
    let catSplits = imageName.split('_');
    for (let i = 0; i < catSplits.length; i++) {
      let cat = catSplits[i];
      if (isInt(cat)) {
        break;
      }
      if (i == catSplits.length - 1) {
        if (cat.startsWith('EmotionIcon')) {
          cats[catIdx] = 'EmotionIcon';
        }
        break;
      }
      cats[catIdx] = cat;
      catIdx++;
    }

    batch.push({
      image_name: imageName,
      image_fts_name: imageName.split('_').map(p => splitCamelcase(p).join(' ')).join(' '),
      image_size: size,
      excel_usages: imageNameToExcelFileUsages[imageName] || [],
      excel_meta: imageNameToExcelMeta[imageName] || {},
      image_cat1: cats[0] || null,
      image_cat2: cats[1] || null,
      image_cat3: cats[2] || null,
      image_cat4: cats[3] || null,
      image_cat5: cats[4] || null,
    });

    if (cats[0]) {
      catmap[cats[0]];
    }
    if (cats[1]) {
      catmap[cats[0]][cats[1]];
    }
    if (cats[2]) {
      catmap[cats[0]][cats[1]][cats[2]];
    }
    if (cats[3]) {
      catmap[cats[0]][cats[1]][cats[2]][cats[3]];
    }
    if (cats[4]) {
      catmap[cats[0]][cats[1]][cats[2]][cats[3]][cats[4]];
    }

    if (batch.length >= maxBatchSize) {
      await commitBatch();
    }
  }

  await commitBatch();

  fs.writeFileSync(path.resolve(process.env.GENSHIN_DATA_ROOT, './ImageIndexCategoryMap.json'), JSON.stringify(catmap, null, 2), 'utf-8');

  console.log('Done.');
  await closeKnex();
}
