import { Request, Response, Router } from 'express';
import { create } from '../routing/router.ts';
import { SiteUserProvider } from '../middleware/auth/SiteUserProvider.ts';
import SettingsPage from '../components/auth/SettingsPage.vue';
import SiteNoticesPage from '../components/site/SiteNoticesPage.vue';
import NumberFormattingNotice from '../components/site/notices/NumberFormattingNotice.vue';
import { SiteNotice } from '../../shared/types/site/site-user-types.ts';
import UserLandingPage from '../components/auth/UserLandingPage.vue';

export default async function(): Promise<Router> {
  const router: Router = create();

  router.get('/', (req: Request, res: Response) => {
    res.render(UserLandingPage, {
      title: 'Saccharose.wiki',
      bodyClass: ['page--user', 'page-landing'],
    });
  });

  router.get('/settings', (req: Request, res: Response) => {
    res.render(SettingsPage, {
      title: 'Settings',
      bodyClass: ['page--user', 'page--settings'],
    });
  });

  router.get('/settings/user-data.json', async (req: Request, res: Response) => {
    res.json({
      userData: req.user,
      userInWikiRequirementsBypass: await SiteUserProvider.isInReqBypass(req.user),
      currentSessionData: req.session,
    });
  });

  router.get('/notices', async (req: Request, res: Response) => {
    const notices: SiteNotice[] = await SiteUserProvider.getAllSiteNotices();
    res.render(SiteNoticesPage, {
      title: 'Site Notices',
      notices,
      bodyClass: ['page--user', 'page--notices'],
    });
  });

  router.get('/notices/number-formatting', async (req: Request, res: Response) => {
    res.render(NumberFormattingNotice, {
      title: 'Notice - Upcoming change on how numbers are formatted',
      bodyClass: ['page--user', 'page--notices'],
    });
  });

  return router;
}
