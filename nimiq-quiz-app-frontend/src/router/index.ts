import { createRouter, createWebHistory } from 'vue-router'
import DiscoveryPage from '../pages/DiscoveryPage.vue'
import AllContestsPage from '../pages/AllContestsPage.vue'
import ProfilePage from '../pages/ProfilePage.vue'
import MyContestsPage from '../pages/MyContestsPage.vue'
import ContestEditorPage from '../pages/ContestEditorPage.vue'
import ContestDetailPage from '../pages/ContestDetailPage.vue'
import QuizGameplayPage from '../pages/QuizGameplayPage.vue'
import AdminDashboard from '../pages/AdminDashboard.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // rovaLayout routes provide their own header/footer (RovaLayout.vue) —
    // App.vue hides the global AppHeader for these so they never double up.
    { path: '/', name: 'discovery', component: DiscoveryPage, meta: { rovaLayout: true } },
    { path: '/contests', name: 'all-contests', component: AllContestsPage, meta: { rovaLayout: true } },
    { path: '/profile', name: 'profile', component: ProfilePage },
    { path: '/contests/mine', name: 'my-contests', component: MyContestsPage },
    { path: '/contests/new', name: 'contest-new', component: ContestEditorPage },
    { path: '/contests/:id/edit', name: 'contest-edit', component: ContestEditorPage },
    { path: '/contests/:id', name: 'contest-detail', component: ContestDetailPage },
    { path: '/contests/:id/play', name: 'quiz-gameplay', component: QuizGameplayPage },
  { path: '/admin', name: 'admin', component: AdminDashboard },
    // Catch-all. Must stay last — vue-router matches in order, so a dynamic
    // route declared below this would be shadowed by it.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
})

