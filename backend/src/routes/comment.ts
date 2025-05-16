import { FastifyInstance } from "fastify";

import { withPrivilegeCheck } from "../middlewares/checkPrivilege";
import PrivilegeChecker from "../utils/privilege";
import { Comment, Post } from "../models";

interface ListQuery {
    page: number;
    pageSize: number;
};

interface CommentBody {
    id: number;
    content: string;
    captcha: string;
}

export default async function commentRoutes(fastify: FastifyInstance) {
    const postRepository = fastify.dataSource.getRepository(Post);
    const commentRepository = fastify.dataSource.getRepository(Comment);

    // 查询某个文章的所有评论，分页
    fastify.get<{ Params: { id: number }, Querystring: ListQuery }>('/post/:id', async (request, reply) => {
        const { id } = request.params;
        const post = await postRepository.findOne({ where: { id } });

        if (!post) {
            return { error: true, message: 'Post not found' };
        }

        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 5;

        const [comments, total] = await commentRepository.findAndCount({
            select: ['id', 'creator', 'content', 'updateTime'],
            where: { pid: id },
            order: { id: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        });

        return { comments, total };
    });

    // 新建评论
    fastify.post<{ Body: CommentBody }>('/new', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.SEND_COMMENT)
    }, async (request, reply) => {
        // 获取id和content
        const { id, content, captcha } = request.body;

        // Check the captcha
        const correctCaptcha = request.axSession.get('captcha');
        if (!correctCaptcha || captcha !== correctCaptcha) {
            return { error: true, message: 'Invalid captcha' };
        }
        // Remove the captcha
        request.axSession.set('captcha', null);

        // 查找文章
        const post = await postRepository.findOne({ where: { id } });

        if (!post) {
            return { error: true, message: 'Post not found' };
        }

        // 内容不能为空
        if (!content) {
            return { error: true, message: 'Missing content' };
        }

        // 创建评论
        const username = request.user.username;
        const newComment = commentRepository.create({
            creator: username,
            content,
            pid: id,
            createTime: new Date(),
            updateTime: new Date()
        });

        const newId = (await commentRepository.save(newComment)).id;

        // 记录Log
        try {
            await fastify.logAction(username, `Create comment #${newId} for post #${id}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Comment created' };
    });

    // 删除评论
    fastify.post<{ Body: { id: number } }>('/delete', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_COMMENT)
    }, async (request, reply) => {
        // 获取id
        const { id } = request.body;

        // 查找评论
        const comment = await commentRepository.findOne({ where: { id } });

        if (!comment) {
            return { error: true, message: 'Comment not found' };
        }

        // 删除评论
        await commentRepository.delete(id);

        // 记录Log
        const username = request.user.username;
        try {
            await fastify.logAction(username, `Delete comment #${id}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Comment deleted' };
    });
};