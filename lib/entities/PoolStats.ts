import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('PoolStats')
export class PoolStats {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  timestamp: Date;

  @Column()
  runtime: number;

  @Column()
  users: number;

  @Column()
  workers: number;

  @Column()
  idle: number;

  @Column()
  disconnected: number;

  @Column('bigint', { default: '0' })
  @Column('double precision', { default: 0 })
  hashrate1m: number;

  @Column('double precision', { default: 0 })
  hashrate5m: number;

  @Column('double precision', { default: 0 })
  hashrate15m: number;

  @Column('double precision', { default: 0 })
  hashrate1hr: number;

  @Column('double precision', { default: 0 })
  hashrate6hr: number;

  @Column('double precision', { default: 0 })
  hashrate1d: number;

  @Column('double precision', { default: 0 })
  hashrate7d: number;

  @Column('float')
  diff: number;

  @Column('bigint')
  accepted: bigint;

  @Column('bigint')
  rejected: bigint;

  @Column('double precision')
  bestshare: number;

  @Column('float')
  SPS1m: number;

  @Column('float')
  SPS5m: number;

  @Column('float')
  SPS15m: number;

  @Column('float')
  SPS1h: number;
}
