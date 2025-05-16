import { FastifyInstance } from "fastify";

import { withPrivilegeCheck } from "../middlewares/checkPrivilege";
import PrivilegeChecker from "../utils/privilege";
import { Message, User } from "../models";
import { validateUsername } from "../utils/validator";

interface ListQuery {
    page: number;
    pageSize: number;
};

interface MessageHistoryQuery {
    contact: string;
    page: number;
    pageSize: number;
};

export default async function messageRoutes(fastify: FastifyInstance) {
    const messageRepository = fastify.dataSource.getRepository(Message);
    const userRepository = fastify.dataSource.getRepository(User);

    /*fastify.get('/message', {
        websocket: true
    }, (socket, req) => {

    });*/

    // 获取某个用户未读私信数量
    fastify.get('/unread', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.IS_LOGIN)
    }, async (request, reply) => {
        const username = request.user.username;

        const unreadMessages = await messageRepository
            .createQueryBuilder('message')
            .where('receiver = :username', { username })
            .andWhere('readTime IS NULL')
            .getCount();

        return { unread: unreadMessages };
    });

    // 获取某个用户的私信列表，即获取所有与该用户聊过天的用户名，以及最后一条消息的截取
    fastify.get('/list', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.IS_LOGIN)
    }, async (request, reply) => {
        const username = request.user.username;

        const senders = await messageRepository.query(`
            SELECT m1.sender, m1.receiver, m1.content, m1.time, COALESCE(unread.unreadCount, 0) AS unreadCount
            FROM message m1
            LEFT JOIN (
                SELECT sender, receiver, COUNT(*) AS unreadCount
                FROM message
                WHERE readTime IS NULL
                  AND sender != ?
                GROUP BY sender, receiver
            ) AS unread ON unread.sender = m1.sender AND unread.receiver = m1.receiver
            WHERE (m1.receiver = ? OR m1.sender = ?)
            AND m1.id IN (
                SELECT MAX(id)
                FROM message
                WHERE (receiver = ? OR sender = ?)
                GROUP BY CASE
                    WHEN sender = ? THEN receiver
                    ELSE sender
                END
            )
            ORDER BY m1.id DESC
        `, [username, username, username, username, username, username]);

        // 每个content最多显示10个字符
        senders.forEach((sender: any) => {
            if (sender.content.length >= 10) {
                sender.content = sender.content.substr(0, 7);
                // 再加上...
                sender.content += '...';
            }
        });

        return senders;
    });

    // 获取与某个用户的私信记录，分页
    fastify.get<{ Querystring: MessageHistoryQuery }>('/history', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.IS_LOGIN)
    }, async (request, reply) => {
        const username = request.user.username;
        const contact = request.query.contact.toLocaleLowerCase();

        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        try {
            validateUsername(contact, new Set());
        }
        catch (err) {
            return { error: true, message: 'Receiver not found' };
        }

        // 判断接收者是否存在
        if (contact !== "system") {
            const contactInfo = await userRepository.findOne({ where: { username: contact } });
            if (!contactInfo) {
                return { error: true, message: 'Receiver not found' };
            }
        }

        const [messages, total] = await messageRepository.findAndCount({
            where: [
                { sender: username, receiver: contact },
                { sender: contact, receiver: username }
            ],
            order: { id: 'ASC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        });

        // 然后把消息设置成已读
        // 直接把所有消息设置成已读
        await messageRepository
            .createQueryBuilder()
            .update()
            .set({ readTime: new Date() })
            .where("sender = :contact", { contact })
            .andWhere("receiver = :username", { username })
            .andWhere("readTime IS NULL")
            .execute();

        return { messages, total };
    });

    fastify.post<{ Body: { receiver: string, content: string } }>('/send', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.IS_LOGIN)
    }, async (request, reply) => {
        const username = request.user.username;
        const { content } = request.body;
        const receiver = request.body.receiver.toLocaleLowerCase();

        if (content.length > 200) {
            return { error: true, message: 'Message too long' };
        }

        try {
            validateUsername(receiver, new Set());
        }
        catch (err) {
            return { error: true, message: 'Receiver not found' };
        }

        // 检查是否给自己发私信
        if (receiver === username) {
            return { error: true, message: 'Cannot send message to self' };
        }

        // 检查接收者是否存在
        const receiverInfo = await userRepository.findOne({ where: { username: receiver } });
        if (!receiverInfo) {
            return { error: true, message: 'Receiver not found' };
        }

        // 检查是否发过信息，如果对方没有回复过，那么只能发送一条信息
        const sentMessages = await messageRepository.count({ where: { sender: username, receiver } });
        const receivedMessages = await messageRepository.count({ where: { sender: receiver, receiver: username } });
        if (sentMessages > 0 && receivedMessages === 0) {
            return { error: true, message: 'Cannot send message again' };
        }

        // 创建私信
        try {
            const newMessage = messageRepository.create({
                sender: username,
                receiver,
                content,
                time: new Date()
            });

            await messageRepository.save(newMessage);
            return newMessage;
        } catch (err) {
            return { error: true, message: 'Error sending message' };
        }
    });

    // 管理员获取所有私信
    fastify.get<{ Querystring: ListQuery }>('/manage', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_MESSAGE)
    }, async (request, reply) => {
        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        const messages = await messageRepository.find({
            order: { id: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        });

        return messages;
    });

    // 管理员删除私信
    fastify.post<{ Body: { id: number } }>('/manage/delete', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_MESSAGE)
    }, async (request, reply) => {
        const { id } = request.body;

        const messageToDelete = await messageRepository.findOne({ where: { id } });
        if (!messageToDelete) {
            return { error: true, message: 'Message not found' };
        }

        await messageRepository.remove(messageToDelete);

        // 记录
        try {
            await fastify.logAction(request.user.username, `Delete message #${id}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (err) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Message deleted successfully' };
    });

    // 管理员发送系统消息
    fastify.post<{ Body: { receiver: string, content: string } }>('/manage/send', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_MESSAGE)
    }, async (request, reply) => {
        const { receiver, content } = request.body;

        // 检查接收者是否存在
        const userRepository = fastify.dataSource.getRepository(User);
        const receiverInfo = await userRepository.findOne({ where: { username: receiver } });
        if (!receiverInfo) {
            return { error: true, message: 'Receiver not found' };
        }

        let newId = -1;
        // 创建私信
        try {
            const newMessage = messageRepository.create({
                sender: 'system',
                receiver,
                content,
                time: new Date()
            });

            newId = (await messageRepository.save(newMessage)).id;
        } catch (err) {
            return { error: true, message: 'Error sending message' };
        }

        // 记录
        try {
            await fastify.logAction(request.user.username, `Send system message #${newId} to ${receiver}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (err) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Message sent successfully' };
    });
};