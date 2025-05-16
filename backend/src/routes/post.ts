import { FastifyInstance } from "fastify";

import { withPrivilegeCheck } from "../middlewares/checkPrivilege";
import PrivilegeChecker from "../utils/privilege";

import { Post, User } from "../models";
import { Brackets } from "typeorm";

interface ListQuery {
    page: number;
    pageSize: number;
};

interface SearchQuery {
    page: number;
    pageSize: number;
    search: string;
    school: string[];
    methods: string[];
    courses: string[];
}

interface PostBody {
    nickname: string;
    realname: string;
    school: string;
    major: string;
    score: string;
    rank: string;
    chooseMethod: string;
    chooseCourse: string;
    content: string;
    captcha: string;
};

export default async function postRoutes(fastify: FastifyInstance) {
    const postRepository = fastify.dataSource.getRepository(Post);

    // 获取所有可显示的投稿
    fastify.get<{ Querystring: SearchQuery }>('/list', async (request, reply) => {
        // page默认是1，pageSize默认15
        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        const { search, school, methods, courses } = request.query;
        // 还要返回总数和总页数
        // 不需要查content
        // 如果search非空，就查找content或者realname或者school或者major有search的
        // 如果school非空，就查找school在school里面的
        // 如果methods非空，就查找chooseMethod在methods里面的
        // 如果courses非空，就查找chooseCourse完全包含courses。例如courses是['物', '化']，那么chooseCourse是'物化生'就可以，但是'物生'就不行
        // 按照上述条件查询
        let queryBuilder = postRepository.createQueryBuilder("post")
            .select(['post.id', 'post.nickname', 'post.creator', 'post.school', 'post.major', 'post.score', 'post.rank', 'post.chooseMethod', 'post.chooseCourse', 'post.available', 'post.updateTime'])
            .where("post.available = :available", { available: true });

        if (search) {
            queryBuilder = queryBuilder.andWhere(
                new Brackets(qb => {
                    qb.where("post.content LIKE :search", { search: `%${search}%` })
                        .orWhere("post.nickname LIKE :search", { search: `%${search}%` })
                        .orWhere("post.school LIKE :search", { search: `%${search}%` })
                        .orWhere("post.major LIKE :search", { search: `%${search}%` });
                })
            );

            queryBuilder = queryBuilder.addSelect(
                `CASE
                WHEN post.nickname LIKE :search THEN 1
                WHEN post.school LIKE :search THEN 2
                WHEN post.major LIKE :search THEN 3
                WHEN post.content LIKE :search THEN 4
                ELSE 5
            END`,
                'searchOrder'
            ).setParameter('search', `%${search}%`).orderBy('searchOrder', 'ASC');
        }

        if (school && school.length > 0) {
            queryBuilder = queryBuilder.andWhere("post.school IN (:...school)", { school });
        }

        if (methods && methods.length > 0) {
            queryBuilder = queryBuilder.andWhere("post.chooseMethod IN (:...methods)", { methods });
        }

        if (courses && courses.length > 0) {
            for (const course of courses) {
                queryBuilder = queryBuilder.andWhere("post.chooseCourse LIKE :course", { course: `%${course}%` });
            }
        }

        queryBuilder.addOrderBy('post.updateTime', 'DESC');

        const [posts, total] = await queryBuilder
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        return { posts, total };
    });

    // 获取所有的学校，需要去重
    fastify.get('/school/list', async (request, reply) => {
        const schools = await postRepository.createQueryBuilder("post")
            .select("post.school", "school")
            .where("post.available = :available", { available: true })
            .distinct(true)
            .getRawMany();

        const schoolNames = schools.map(school => school.school);

        schoolNames.sort((a, b) => a.localeCompare(b, 'zh-CN'));

        return schoolNames;
    });

    // 查看某个投稿
    fastify.get<{ Params: { id: number } }>('/:id', async (request, reply) => {
        const { id } = request.params;

        // 先判断id的格式
        if (isNaN(id)) {
            return { error: true, message: 'Invalid id' };
        }

        // 如果登录了，就查所有字段。否则需要去除ip和lastUpdateUser。
        // 如果登录了，还可以看到不可见的投稿。
        const user = request.axSession.get('user');
        const userRepository = fastify.dataSource.getRepository(User);
        const userInfo = user ? await userRepository.findOne({ where: { username: user } }) : null;

        let post: Post | undefined;
        if (userInfo && PrivilegeChecker.check(userInfo, PrivilegeChecker.MANAGE_POST)) {
            post = await postRepository.findOne({
                where: { id }
            });
        }
        else if (userInfo) {
            // 查询指定id，且可见的或者是自己的
            // 即 available = true 或者 creator = user
            const queryBuilder = postRepository.createQueryBuilder("post")
                .select(['post.id', 'post.nickname', 'post.realname', 'post.creator', 'post.school', 'post.major', 'post.score', 'post.rank', 'post.chooseMethod', 'post.chooseCourse', 'post.content', 'post.available', 'post.updateTime', 'post.lastUpdateUser'])
                .where("post.id = :id", { id })
                .andWhere(new Brackets(qb => {
                    qb.where("post.available = :available", { available: true })
                        .orWhere("post.creator = :creator", { creator: user });
                }));
            post = await queryBuilder.getOne();
        }
        else {
            // 只能查看可见的
            post = await postRepository.findOne({
                select: ['id', 'nickname', 'realname', 'creator', 'school', 'major', 'score', 'rank', 'chooseMethod', 'chooseCourse', 'content', 'available', 'updateTime'],
                where: { id, available: true }
            });
        }

        if (!post) {
            return { error: true, message: 'Post not found' };
        }

        return post;
    });

    // 新建投稿
    fastify.post<{ Body: PostBody }>('/new', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.SEND_POST)
    }, async (request, reply) => {
        // 获取IP
        const ip = (request.headers['x-real-ip'] as string) || request.ip;

        // 获取所有信息
        let { nickname, realname, school, major, score, rank, chooseMethod, chooseCourse, content, captcha } = request.body;

        // Check the captcha
        const correctCaptcha = request.axSession.get('captcha');
        if (!correctCaptcha || captcha !== correctCaptcha) {
            return { error: true, message: 'Invalid captcha' };
        }
        // Remove the captcha
        request.axSession.set('captcha', null);

        // 先看不能有空的
        if (!nickname || !realname || !school || !major || !score || !rank || !chooseMethod || !chooseCourse || !content) {
            return { error: true, message: 'Missing fields' };
        }

        nickname = nickname.trim();
        realname = realname.trim();
        school = school.trim();
        major = major.trim();
        score = score.trim();
        rank = rank.trim();

        const formatTester = /^[a-zA-Z0-9\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef\s\-\+\*<>]*$/

        const validateFields = (value: string, name: string, minLength: number, maxLength: number) => {
            if (!formatTester.test(value)) {
                throw new Error(`Invalid ${name} format`);
            }
            if (value.length < minLength || value.length > maxLength) {
                throw new Error(`Invalid ${name} length`);
            }
        };

        try {
            validateFields(nickname, 'nickname', 1, 20);
            validateFields(realname, 'realname', 2, 20);
            validateFields(school, 'school', 2, 20);
            validateFields(major, 'major', 2, 40);
            validateFields(score, 'score', 1, 10);
            validateFields(rank, 'rank', 1, 10);
        }
        catch (e) {
            return { error: true, message: e.message };
        }

        const admissionMethod = ["高考", "强基计划", "三位一体", "少年班/少创班", "出国", "艺术特长", "体育特长", "其他"];
        if (!admissionMethod.includes(chooseMethod)) {
            return { error: true, message: 'Invalid admission method' };
        }

        const chooseCourseList = ["物", "化", "生", "史", "地", "政", "技"];
        // 选课只能最多选3个，且只能是物化生史地政技
        if (chooseCourse.length > 3) {
            return { error: true, message: 'Invalid choose course length' };
        }

        for (let i = 0; i < chooseCourse.length; i++) {
            if (!chooseCourseList.includes(chooseCourse[i])) {
                return { error: true, message: 'Invalid choose course' };
            }
        }

        // 如果对应的用户已经有3次及以上的未公开的投稿，就不允许再投稿，直接计数
        const count = await postRepository.count({
            where: { creator: request.user.username, available: false }
        });

        if (count >= 3) {
            return { error: true, message: 'Too many posts' };
        }

        let newId = -1;

        try {
            const newPost = postRepository.create({
                creator: request.user.username,
                nickname,
                realname,
                school,
                major,
                score,
                rank,
                chooseMethod,
                chooseCourse,
                content,
                ip,
                createTime: new Date(),
                updateTime: new Date()
            });
            newId = (await postRepository.save(newPost)).id;
        }
        catch (e) {
            console.log(e);
            return { error: true, message: 'Error creating post' };
        }

        // 插入Log记录
        try {
            await fastify.logAction(request.user.username, `Create post #${newId}`, ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Post created successfully' };
    });

    // 登录了，管理员就获取所有的投稿，否则就获取自己的投稿
    fastify.get<{ Querystring: ListQuery }>('/manage', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.IS_LOGIN),
    }, async (request, reply) => {
        // page默认是1，pageSize默认10
        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        // 还要返回总数和总页数
        // 先返回所有不可见的，再返回可见的
        // 不需要查content
        let posts: Post[];
        let total: number;

        const username = request.user.username;
        const privilege = request.user.privilege;

        if (PrivilegeChecker.check({ privilege }, PrivilegeChecker.MANAGE_POST)) {
            [posts, total] = await postRepository.findAndCount({
                select: ['id', 'nickname', 'creator', 'realname', 'school', 'major', 'score', 'rank', 'chooseMethod', 'chooseCourse', 'ip', 'available', 'updateTime', 'lastUpdateUser'],
                order: { available: "ASC", updateTime: 'DESC' },
                skip: (page - 1) * pageSize,
                take: pageSize
            });
        }
        else {
            [posts, total] = await postRepository.findAndCount({
                select: ['id', 'nickname', 'creator', 'realname', 'school', 'major', 'score', 'rank', 'chooseMethod', 'chooseCourse', 'available', 'updateTime'],
                where: { creator: username },
                order: { available: "ASC", updateTime: 'DESC' },
                skip: (page - 1) * pageSize,
                take: pageSize
            });
        }

        return { posts, total };
    });

    // 修改投稿的可见性
    fastify.post<{ Body: { id: number } }>('/manage/visible', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_POST),
    }, async (request, reply) => {
        // 获取id
        const { id } = request.body;

        const post = await postRepository.findOne({
            where: { id }
        });

        if (!post) {
            return { error: true, message: 'Post not found' };
        }

        // 修改可见性
        post.available = !post.available;
        post.lastUpdateUser = request.user.username;
        await postRepository.save(post);

        // 创建Log记录
        try {
            await fastify.logAction(request.user.username, `Change post #${id} visibility to ${post.available}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }
    });
}