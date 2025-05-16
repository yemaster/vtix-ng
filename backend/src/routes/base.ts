import { FastifyInstance, FastifyRequest } from "fastify";

import svgCaptcha from "svg-captcha";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const REGION = process.env.AWS_REGION;
const ENDPOINT = process.env.AWS_ENDPOINT;
const BUCKET = "rgu";

const s3 = new S3Client({
    credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
    },
    region: REGION,
    endpoint: ENDPOINT,
    forcePathStyle: true, // 如果需要路径样式的 URL
});

export default async function baseRoutes(fastify: FastifyInstance) {
    // 获取比赛的题目列表
    fastify.get<{ Params: { id: number } }>(
        "/captcha",
        async (request, reply) => {
            const captcha = svgCaptcha.create({
                ignoreChars: "0o1il",
                color: true,
                noise: 4,
            });
            request.axSession.set("captcha", captcha.text);
            reply.type("image/svg+xml");
            return reply.send(captcha.data);
        }
    );

    const generateFileHash = (file: Buffer) => {
        const crypto = require("crypto");
        const hash = crypto.createHash("md5");
        hash.update(file);
        return hash.digest("hex");
    };

    // 上传文件
    fastify.post("/upload", async (request, reply) => {
        const parts = request.files(); // 获取上传的文件数组
        const errFiles: string[] = [];
        const succMap: { [key: string]: string } = {};

        let msg = "";

        for await (const part of parts) {
            try {
                // 将文件读取为 Buffer 以计算哈希值
                const fileBuffer = await part.toBuffer();
                const fileHash = generateFileHash(fileBuffer);
                const fileExtension = part.filename.split(".").pop(); // 获取文件扩展名

                // 首先检查文件大小
                if (fileBuffer.byteLength > 1024 * 1024 * 2) {
                    throw new Error("文件大小不能超过 2MB");
                }

                // 使用文件哈希值作为文件名，并保持扩展名
                const fileName = `${fileHash}.${fileExtension}`;

                const uploadParams = {
                    Bucket: BUCKET, // 替换为你的 S3 Bucket 名称
                    Key: fileName, // 使用哈希值作为唯一文件名
                    Body: fileBuffer, // 文件内容
                    ContentType: part.mimetype, // 文件类型
                };

                // 使用 AWS SDK v3 的 PutObjectCommand 上传文件
                const command = new PutObjectCommand(uploadParams);
                await s3.send(command);

                // 拼接 S3 文件的 URL
                const fileUrl = `${ENDPOINT}/${BUCKET}/${uploadParams.Key}`;
                succMap[part.filename] = fileUrl;
            } catch (err) {
                errFiles.push(part.filename); // 上传失败的文件名
                msg += err.message;
            }
        }

        return {
            msg,
            code: 0,
            data: {
                errFiles,
                succMap,
            },
        };
    });
}
