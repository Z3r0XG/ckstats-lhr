import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

import { User } from './User';
import { WorkerStats } from './WorkerStats';

@Entity('Worker')
@Unique(['userAddress', 'name'])
export class Worker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: '' })
  name: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

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

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  lastUpdate: Date;

  @Column('double precision', { default: 0 })
  shares: number;

  @Column('float', { default: 0 })
  bestShare: number;

  @Column('double precision', { default: 0 })
  bestEver: number;

  @ManyToOne('User', 'workers')
  user: Promise<User>;

  @Column()
  @Index()
  userAddress: string;

  @OneToMany('WorkerStats', 'worker')
  stats: WorkerStats[];

  @Column({ length: 256, default: '' })
  userAgent: string;

  @Column({ type: 'text', nullable: true })
  userAgentRaw?: string | null;
}
