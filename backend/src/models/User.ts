import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    username: string

    @Column()
    password: string

    @Column({ default: 1023 })
    privilege: number

    @Column({ default: "127.0.0.1" })
    registerIP: string

    @Column()
    registerTime: Date
}