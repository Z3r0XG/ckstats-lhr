import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';

import { Worker } from './Worker';

@Entity('WorkerStats')
export class WorkerStats {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Worker, (worker) => worker.stats)
  @JoinColumn({ name: 'workerId', referencedColumnName: 'id' })
  worker: Promise<Worker>;

  @Column()
  workerId: number;

  @Column('double precision', { default: 0 })
  hashrate1m: number;

  @Column('double precision', { default: 0 })
  hashrate5m: number;

  @Column('double precision', { default: 0 })
  hashrate1hr: number;

  @Column('double precision', { default: 0 })
  hashrate1d: number;

  @Column('double precision', { default: 0 })
  hashrate7d: number;

  @Column('bigint', { default: '0' })
  started: string;

  @Column('double precision', { default: 0 })
  shares: number;

  @Column('float', { default: 0 })
  bestShare: number;

  @Column('double precision', { default: 0 })
  bestEver: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  timestamp: Date;
}
