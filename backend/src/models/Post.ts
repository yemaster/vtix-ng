import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from "typeorm"

@Entity()
export class Post {
    @PrimaryGeneratedColumn()
    id: number

    @Column({ default: "" })
    creator: string;

    @Column()
    nickname: string;

    @Column()
    realname: string;

    @Column()
    school: string;

    @Column()
    major: string;

    @Column()
    score: string;

    @Column()
    rank: string;

    @Column()
    chooseMethod: string;

    @Column()
    chooseCourse: string;

    @Column("text")
    content: string;

    // IP地址
    @Column()
    ip: string;

    @Column({ default: false })
    available: boolean;

    // 最后修改的用户
    @Column({ default: 'user' })
    lastUpdateUser: string;

    // 创建时间和最后修改时间，用Unix时间戳表示
    @Column()
    createTime: Date;

    @Column()
    updateTime: Date;
}