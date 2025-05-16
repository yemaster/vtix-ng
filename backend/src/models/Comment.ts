import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, BeforeUpdate, Index } from "typeorm";

@Entity()
export class Comment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ default: "" })
    creator: string;

    @Column()
    @Index() // 为 pid 添加索引，提高查询性能
    pid: number;

    @Column("text") // 如果 content 可能会很长，使用 text 类型
    content: string;

    @Column()
    createTime: Date;

    @Column()
    updateTime: Date;
}