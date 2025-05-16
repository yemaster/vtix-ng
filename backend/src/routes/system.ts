import { FastifyInstance } from "fastify";

import { withPrivilegeCheck } from "../middlewares/checkPrivilege";
import PrivilegeChecker from "../utils/privilege";
import { Log } from "../models";

interface ListQuery {
    page: number;
    pageSize: number;
};

export default async function systemRoutes(fastify: FastifyInstance) {
    // 获取系统全部日志
    fastify.get<{ Querystring: ListQuery }>('/logs', {
        preHandler: withPrivilegeCheck(PrivilegeChecker.MANAGE_SYSTEM)
    }, async (request, reply) => {
        // page默认是1，pageSize默认10
        const page = request.query.page || 1;
        const pageSize = request.query.pageSize || 10;

        const logRepository = fastify.dataSource.getRepository(Log);
        const logs = await logRepository.find({
            select: ['username', 'detail', 'ip', 'time'],
            order: { id: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        });
        const total = await logRepository.count();

        return { logs, total };
    });
};