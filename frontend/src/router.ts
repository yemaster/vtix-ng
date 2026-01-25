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
                    path: '/t/:id',
                    name: 'test',
                    component: () => import('./pages/test/TestView.vue')
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

export default router
