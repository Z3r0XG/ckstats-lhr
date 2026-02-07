import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';

import { User } from './User';

@Entity('UserStats')
export class UserStats {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.stats)
  @JoinColumn({ name: 'userAddress', referencedColumnName: 'address' })
  user: Promise<User>;

  @Column()
  @Index('userAddress_timestamp_idx')
  @Index('userAddress_bestEver_timestamp_idx')
  @Index('userAddress_hashrate1hr_timestamp_idx')
  userAddress: string;

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
  lastShare: string;

  @Column({ default: 0 })
  workerCount: number;

  @Column('double precision', { default: 0 })
  shares: number;

  @Column('float', { default: 0 })
  bestShare: number;

  @Column('double precision', { default: 0 })
  bestEver: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index('timestamp_idx')
  @Index('userAddress_timestamp_idx')
  @Index('userAddress_bestEver_timestamp_idx')
  @Index('userAddress_hashrate1hr_timestamp_idx')
  timestamp: Date;
}
