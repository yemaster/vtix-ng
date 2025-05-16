import { FastifyRequest, FastifyReply } from 'fastify';

export default function queryArrayMiddleware(request: FastifyRequest, reply: FastifyReply, done: Function) {
    const query = request.query;

    Object.keys(query).forEach(key => {
        if (key.endsWith('[]')) {
            const newKey = key.slice(0, -2); // Remove []
            request.query[newKey] = Array.isArray(query[key]) ? query[key] : [query[key]];
            delete query[key];
        }
    });

    done();
}