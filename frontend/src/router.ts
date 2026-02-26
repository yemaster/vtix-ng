import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
    showSpinner: false,
    trickleSpeed: 120,
    minimum: 0.08
})

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'main',
            component: () => import('./layouts/MainLayout.vue'),
            children: [
                {
                    path: 'home',
                    name: 'home',
                    component: () => import('./pages/home/HomeView.vue'),
                    meta: { title: '首页' }
                },
                {
                    path: '',
                    name: 'question-bank',
                    component: () => import('./pages/question-bank/QuestionBankView.vue'),
                    meta: { title: '题库' }
                },
                {
                    path: 'question-bank/plaza',
                    name: 'question-bank-plaza',
                    component: () => import('./pages/question-bank/QuestionBankPlazaView.vue'),
                    meta: { title: '题库广场' }
                },
                {
                    path: 'brawl',
                    name: 'question-bank-brawl',
                    component: () => import('./pages/brawl/QuestionBankBrawlView.vue'),
                    meta: { title: '题库大乱斗' }
                },
                {
                    path: 'records',
                    name: 'records',
                    component: () => import('./pages/records/RecordsView.vue'),
                    meta: { title: '练习记录' }
                },
                {
                    path: 'notices',
                    name: 'notices',
                    component: () => import('./pages/notices/NoticesListView.vue'),
                    meta: { title: '公告列表' }
                },
                {
                    path: 'notices/:id',
                    name: 'notice-detail',
                    component: () => import('./pages/notices/NoticeDetailView.vue'),
                    meta: { title: '通知公告' }
                },
                {
                    path: 'help',
                    name: 'help',
                    component: () => import('./pages/help/HelpView.vue'),
                    meta: { title: '使用帮助' }
                },
                {
                    path: 'about',
                    name: 'about',
                    component: () => import('./pages/about/AboutView.vue'),
                    meta: { title: '关于' }
                },
                {
                    path: 'user/:name',
                    name: 'user-space',
                    component: () => import('./pages/profile/PersonalSpaceView.vue'),
                    meta: { title: '个人空间' }
                },
                {
                    path: 'user/:name/edit',
                    name: 'user-edit',
                    component: () => import('./pages/profile/EditProfileView.vue'),
                    meta: { title: '编辑资料' }
                },
                {
                    path: 'wrong-problems',
                    name: 'wrong-problems',
                    component: () => import('./pages/records/WrongProblemsView.vue'),
                    meta: { title: '错题本' }
                },
                {
                    path: 'messages',
                    name: 'messages',
                    component: () => import('./pages/messages/MessageListView.vue'),
                    meta: { title: '我的消息' }
                },
                {
                    path: '/t/:id',
                    name: 'test',
                    component: () => import('./pages/test/TestView.vue'),
                    meta: { title: '练习中' }
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
                    component: () => import('./pages/admin/AdminHomeView.vue'),
                    meta: { title: '管理后台' }
                },
                {
                    path: 'user-groups',
                    name: 'admin-user-groups',
                    component: () => import('./pages/admin/UserGroupsView.vue'),
                    meta: { title: '用户组管理' }
                },
                {
                    path: 'users',
                    name: 'admin-users',
                    component: () => import('./pages/admin/UsersView.vue'),
                    meta: { title: '用户管理' }
                },
                {
                    path: 'notices',
                    name: 'admin-notices',
                    component: () => import('./pages/admin/NoticesView.vue'),
                    meta: { title: '通知公告管理' }
                },
                {
                    path: 'question-banks',
                    name: 'admin-question-banks',
                    component: () => import('./pages/admin/QuestionBankManageView.vue'),
                    meta: { title: '题库管理' }
                },
                {
                    path: 'question-banks/review',
                    name: 'admin-question-bank-review',
                    component: () => import('./pages/admin/QuestionBankReviewView.vue'),
                    meta: { title: '审核题库' }
                },
                {
                    path: 'question-banks/create',
                    name: 'admin-question-bank-create',
                    component: () => import('./pages/admin/QuestionBankCreateView.vue'),
                    meta: { title: '新建题库' }
                },
                {
                    path: 'question-banks/:code/edit',
                    name: 'admin-question-bank-edit',
                    component: () => import('./pages/admin/QuestionBankEditView.vue'),
                    meta: { title: '编辑题库' }
                }
            ]
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('./pages/auth/LoginView.vue'),
            meta: { title: '登录' }
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('./pages/auth/RegisterView.vue'),
            meta: { title: '注册' }
        },
        {
            path: '/error',
            name: 'error',
            component: () => import('./pages/error/ErrorView.vue'),
            meta: { title: '错误' }
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: () => import('./pages/error/ErrorView.vue'),
            meta: { title: '页面未找到' }
        }
    ],
    scrollBehavior() {
        return { top: 0 }
    }
})

router.beforeEach((to, from) => {
    if (to.fullPath !== from.fullPath) {
        NProgress.start()
    }
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

const TITLE_SUFFIX = ' - vtix 答题'
const DEFAULT_TITLE = `VTIX${TITLE_SUFFIX}`
router.afterEach((to) => {
    NProgress.done()
    const title = typeof to.meta?.title === 'string' ? to.meta.title.trim() : ''
    document.title = title ? `${title}${TITLE_SUFFIX}` : DEFAULT_TITLE
})

router.onError(() => {
    NProgress.done()
})

export default router
