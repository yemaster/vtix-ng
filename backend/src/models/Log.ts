import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
export class Log {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    username: string

    @Column()
    detail: string

    @Column()
    ip: string

    @Column()
    time: Date
}