import { createRouter, createWebHistory } from 'vue-router'
import DiscoveryPage from '../pages/DiscoveryPage.vue'
import AllContestsPage from '../pages/AllContestsPage.vue'
import ProfilePage from '../pages/ProfilePage.vue'
import MyContestsPage from '../pages/MyContestsPage.vue'
import ContestEditorPage from '../pages/ContestEditorPage.vue'
import ContestDetailPage from '../pages/ContestDetailPage.vue'
import WaitingRoomPage from '../pages/WaitingRoomPage.vue'
import QuizGameplayPage from '../pages/QuizGameplayPage.vue'
import AdminDashboard from '../pages/AdminDashboard.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'
export const router = createRouter({
  history: createWebHistory(),
  /*
   * Without this, a client-side navigation keeps the current scroll offset —
   * so opening a contest from halfway down /contests drops you halfway down
   * the contest page, which reads as a broken link rather than a navigation.
   * `savedPosition` is the offset vue-router captured for the history entry
   * you are returning to; honouring it is what makes the back button behave
   * like a browser instead of a reset.
   *
   * This is load-bearing now that App.vue cross-fades between routes: the
   * outgoing page is removed before the incoming one mounts, so without a
   * scroll reset the new page would inherit the old page's offset with no
   * visual cue explaining why.
   *
   * Mobile caveat: below 768px the scroller is .app-view inside the
   * fixed-height #app shell (src/style.css), not the window — so this function
   * has nothing it can scroll there. Forward navigation still lands at the top
   * regardless, because a route change mounts a fresh element at scrollTop 0.
   * What genuinely does not survive is `savedPosition`: going back on a phone
   * returns you to the top of the previous page rather than to where you were.
   * Restoring it would mean scrolling the container from here, after the
   * out-in transition has mounted the new page — worth doing, but it needs
   * testing on a device, not a guess.
   */
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
  routes: [
    // AppHeader.vue renders on every route (see App.vue). The old per-route
    // `rovaLayout` meta only existed to suppress it on the ROVA pages that had
    // their own RovaNav; that nav is gone, so the flag went with it.
    { path: '/', name: 'discovery', component: DiscoveryPage },
    { path: '/contests', name: 'all-contests', component: AllContestsPage },
    { path: '/profile', name: 'profile', component: ProfilePage },
    { path: '/contests/mine', name: 'my-contests', component: MyContestsPage },
    { path: '/contests/new', name: 'contest-new', component: ContestEditorPage },
    { path: '/contests/:id/edit', name: 'contest-edit', component: ContestEditorPage },
    { path: '/contests/:id', name: 'contest-detail', component: ContestDetailPage },
    // The registration_closed window, made visible. Reached from the contest
    // page; it advances itself to quiz-gameplay at quizStartAt.
    { path: '/contests/:id/waiting', name: 'contest-waiting', component: WaitingRoomPage },
    { path: '/contests/:id/play', name: 'quiz-gameplay', component: QuizGameplayPage },
    { path: '/admin', name: 'admin', component: AdminDashboard },
    // Catch-all. Must stay last — vue-router matches in order, so a dynamic
    // route declared below this would be shadowed by it.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
})

