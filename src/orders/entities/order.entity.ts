import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entité Order - Représente une commande dans PostgreSQL RDS
 * 
 * Statuts:
 * - PENDING: Commande créée, en attente de traitement
 * - PROCESSING: Commande en cours de traitement (dépuis SQS)
 * - COMPLETED: Commande traitée avec succès
 * - FAILED: Échec du traitement
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  customerEmail: string;

  @Column({ type: 'varchar', length: 255 })
  customerName: string;

  @Column({ type: 'varchar', length: 500 })
  shippingAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'jsonb' })
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @Index()
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  @Index()
  idempotencyKey?: string;

  @Column({ type: 'text', nullable: true })
  processingResult?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;
}
