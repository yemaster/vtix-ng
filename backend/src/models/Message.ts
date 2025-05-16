// 私信
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm"

@Entity()
export class Message {
    // 主键，自增
    @PrimaryGeneratedColumn()
    id: number

    // 发送者
    @Column()
    @Index()
    sender: string

    // 接收者
    @Column()
    @Index()
    receiver: string

    // 内容
    @Column()
    content: string

    // 阅读时间，默认是null，表示未读
    @Column({ nullable: true })
    readTime: Date

    // 发送时间
    @Column()
    time: Date
}