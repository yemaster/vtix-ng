import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'main',
            component: () => import('./layouts/MainLayout.vue'),
            children: [
                {
                    path: '',
                    name: 'home',
                    component: () => import('./pages/home/HomeView.vue')
                },
                {
                    path: 'question-bank',
                    name: 'question-bank',
                    component: () => import('./pages/question-bank/QuestionBankView.vue')
                },
                {
                    path: 'question-bank/create',
                    name: 'question-bank-create',
                    component: () => import('./pages/question-bank/CreateQuestionBankView.vue')
                },
                {
                    path: 'question-bank/:code/edit',
                    name: 'question-bank-edit',
                    component: () => import('./pages/question-bank/EditQuestionBankView.vue')
                },
                {
                    path: 'my-question-bank',
                    name: 'my-question-bank',
                    component: () => import('./pages/question-bank/MyQuestionBankView.vue')
                },
                {
                    path: 'records',
                    name: 'records',
                    component: () => import('./pages/records/RecordsView.vue')
                },
                {
                    path: 'help',
                    name: 'help',
                    component: () => import('./pages/help/HelpView.vue')
                },
                {
                    path: 'about',
                    name: 'about',
                    component: () => import('./pages/about/AboutView.vue')
                },
                {
                    path: 'user/:name',
                    name: 'user-space',
                    component: () => import('./pages/profile/PersonalSpaceView.vue')
                },
                {
                    path: 'user/:name/edit',
                    name: 'user-edit',
                    component: () => import('./pages/profile/EditProfileView.vue')
                },
                {
                    path: 'wrong-problems',
                    name: 'wrong-problems',
                    component: () => import('./pages/records/WrongProblemsView.vue')
                },
                {
                    path: '/t/:id',
                    name: 'test',
                    component: () => import('./pages/test/TestView.vue')
                }
            ]
        },
        {
            path: '/admin',
            name: 'admin',
            component: () => import('./layouts/AdminLayout.vue'),
            children: [
                {
                    path: '',
                    name: 'admin-home',
                    component: () => import('./pages/admin/AdminHomeView.vue')
                },
                {
                    path: 'trends',
                    name: 'admin-trends',
                    component: () => import('./pages/admin/AdminTrendsView.vue')
                },
                {
                    path: 'user-groups',
                    name: 'admin-user-groups',
                    component: () => import('./pages/admin/UserGroupsView.vue')
                },
                {
                    path: 'users',
                    name: 'admin-users',
                    component: () => import('./pages/admin/UsersView.vue')
                },
                {
                    path: 'question-banks',
                    name: 'admin-question-banks',
                    component: () => import('./pages/admin/QuestionBankManageView.vue')
                },
                {
                    path: 'question-banks/create',
                    name: 'admin-question-bank-create',
                    component: () => import('./pages/admin/QuestionBankCreateView.vue')
                },
                {
                    path: 'question-banks/:code/edit',
                    name: 'admin-question-bank-edit',
                    component: () => import('./pages/admin/QuestionBankEditView.vue')
                }
            ]
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('./pages/auth/LoginView.vue')
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('./pages/auth/RegisterView.vue')
        }
    ],
    scrollBehavior() {
        return { top: 0 }
    }
})

router.beforeEach((to, from) => {
    const isAuthPage = to.name === 'login' || to.name === 'register'
    const hasRedirect = typeof to.query.redirect === 'string'
    if (!isAuthPage || hasRedirect) return true
    const fromRedirect = typeof from.query.redirect === 'string' ? from.query.redirect : from.fullPath
    const safeRedirect =
        fromRedirect.startsWith('/login') || fromRedirect.startsWith('/register')
            ? '/'
            : fromRedirect
    return {
        name: to.name ?? to.path,
        query: { ...to.query, redirect: safeRedirect },
        replace: true
    }
})

export default router
