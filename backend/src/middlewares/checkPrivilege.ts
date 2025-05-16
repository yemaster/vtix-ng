import { FastifyRequest, FastifyReply } from "fastify";
import { User } from "../models";
import PrivilegeChecker from "../utils/privilege";

declare module 'fastify' {
    interface FastifyRequest {
        user?: User;
    }
}

/**
 * 检查用户权限
 * @param request FastifyRequest
 * @param reply  FastifyReply
 * @param requiredPrivilege  number
 * @returns 
 */
async function checkPrivileges(
    request: FastifyRequest,
    reply: FastifyReply,
    requiredPrivilege: number
) {
    // 检查Cookie中是否有用户信息
    const userSession = request.axSession.get("user");
    if (!userSession) {
        reply.send({ error: true, message: 'Not logged in' });
        return;
    }

    // 检查数据库中是否有对应用户
    const userRepository = request.server.dataSource.getRepository(User);
    const userInfo = await userRepository.findOne({ where: { username: userSession } });

    if (!userInfo) {
        reply.send({ error: true, message: 'Not logged in' });
        return;
    }

    // 检查用户权限
    // 如果requiredPrivilege是0，那么只需要登录即可，PrivilegeChecker.check肯定返回true
    if (!PrivilegeChecker.check(userInfo, requiredPrivilege)) {
        reply.send({ error: true, message: 'No permission' });
        return;
    }

    // 将用户信息挂载到request对象上
    request.user = userInfo;
}

export function withPrivilegeCheck(privilege: number) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        await checkPrivileges(request, reply, privilege);
    };
}