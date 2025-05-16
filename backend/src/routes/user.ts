import { FastifyInstance } from "fastify";

import { withPrivilegeCheck } from "../middlewares/checkPrivilege";
import PrivilegeChecker from "../utils/privilege";
import { validatePassword, validateUsername } from "../utils/validator";

// Bcrypt
import bcrypt from 'bcrypt';

import { User } from "../models";
import { Between } from "typeorm";

interface ListQuery {
    page: number;
    pageSize: number;
};

interface LoginBody {
    username: string;
    password: string;
    captcha: string;
}

interface RegisterBody {
    username: string;
    password: string;
    captcha: string;
}

export default async function userRoutes(fastify: FastifyInstance) {
    const userRepository = fastify.dataSource.getRepository(User);
    
    // 当前用户信息
    fastify.get('/check', async (request, reply) => {
        const user = request.axSession.get('user');

        if (user) {
            const userInfo = await userRepository.findOne({ where: { username: user } });

            if (userInfo) {
                return { user, privilege: userInfo.privilege };
            }
        }

        return { error: true, message: 'Not logged in' };
    });

    // 登录
    fastify.post<{ Body: LoginBody }>('/login', {
        schema: {
            body: {
                type: 'object',
                required: ['username', 'password', 'captcha'],
                properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                    captcha: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { password, captcha } = request.body;
        const username = request.body.username.toLocaleLowerCase();

        // Check the captcha
        const correctCaptcha = request.axSession.get('captcha');
        if (!correctCaptcha || captcha !== correctCaptcha) {
            return { error: true, message: 'Invalid captcha' };
        }
        // Remove the captcha
        request.axSession.set('captcha', null);

        if (!username || !password) {
            return { error: true, message: 'Missing username or password' };
        }

        try {
            validateUsername(username);
            validatePassword(password);
        }
        catch (e) {
            return { error: true, message: e.message };
        }

        const user = await userRepository.findOne({ where: { username } });

        if (!user) {
            return { error: true, message: 'Invalid username or password' };
        }

        // Check the password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return { error: true, message: 'Invalid username or password' };
        }

        // 记录Log日志
        try {
            await fastify.logAction(username, 'Login', (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        // Set the session
        request.axSession.set('user', user.username);

        return { user: user.username, privilege: user.privilege };
    });

    // 注册
    fastify.post<{ Body: RegisterBody }>('/register', {
        schema: {
            body: {
                type: 'object',
                required: ['username', 'password', 'captcha'],
                properties: {
                    username: { type: 'string' },
                    password: { type: 'string' },
                    captcha: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { password, captcha } = request.body;
        const username = request.body.username.toLocaleLowerCase();

        // Check the captcha
        const correctCaptcha = request.axSession.get('captcha');
        if (!correctCaptcha || captcha !== correctCaptcha) {
            return { error: true, message: 'Invalid captcha' };
        }
        // Remove the captcha
        request.axSession.set('captcha', null);

        if (!username || !password) {
            return { error: true, message: 'Missing username or password' };
        }

        try {
            validateUsername(username);
            validatePassword(password);
        }
        catch (e) {
            return { error: true, message: e.message };
        }

        // Check if the username is already taken
        const user = await userRepository.findOne({ where: { username } });
        if (user) {
            return { error: true, message: 'Username already taken' };
        }

        // 同一个IP地址，在一天内注册超过3个账号，就不允许再注册
        const ip = (request.headers['x-real-ip'] as string) || request.ip;
        // 先找到最近一天内的注册记录
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const count = await userRepository.count({
            where: { registerIP: ip, registerTime: Between(yesterday, now) }
        });
        if (count >= 3) {
            return { error: true, message: 'Too many accounts registered' };
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // 记录log
        try {
            await fastify.logAction(username, 'Register', ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        try {
            // Create the user
            const newUser = userRepository.create({
                username,
                password: hash,
                registerIP: ip,
                registerTime: new Date()
            });

            await userRepository.save(newUser);

            // Set the session
            request.axSession.set('user', newUser.username);

            return { user: newUser.username, privilege: newUser.privilege };
        }
        catch (err) {
            return { error: true, message: 'Error creating user' };
        }
    });

    // 登出
    fastify.post('/logout', async (request, reply) => {
        request.axSession.set('user', null);
        return { message: 'Logged out' };
    });

    // 获取所有用户
    fastify.get<{ Querystring: ListQuery }>('/manage', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_USER)
    }, async (request, reply) => {
        // page默认是1，pageSize默认10
        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        // 获取所有用户，以及计数
        const users = await userRepository.find({
            select: ['id', 'username', 'privilege', 'registerIP', 'registerTime'],
            skip: (page - 1) * pageSize,
            take: pageSize
        });
        const total = await userRepository.count();

        return { users, total };
    });

    // 更改某个用户的权限
    fastify.post<{ Body: { id: number, privilege: number } }>('/manage/privilege', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_USER)
    }, async (request, reply) => {
        // 获取用户id和权限
        const { id, privilege } = request.body;

        // 查找用户
        const userToChange = await userRepository.findOne({ where: { id } });
        if (!userToChange) {
            return { error: true, message: 'User not found' };
        }

        const username = request.user.username;
        // 不能修改自己的权限
        if (userToChange.username === username) {
            return { error: true, message: 'Cannot change own privilege' };
        }

        // 修改权限
        userToChange.privilege = privilege;
        await userRepository.save(userToChange);

        // 创建Log记录
        try {
            await fastify.logAction(username, `Change ${userToChange.username} privilege to ${privilege}`, (request.headers['x-real-ip'] as string) || request.ip);
        }
        catch (e) {
            return { error: true, message: 'Error creating log' };
        }

        return { message: 'Privilege changed' };
    });
}