import {
  IsEmail,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsCurrency,
  Length,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO pour un item de commande
 */
export class OrderItemDto {
  @IsString({ message: 'Le productId doit être une chaîne' })
  productId: string;

  @IsString({ message: 'Le productName doit être une chaîne' })
  productName: string;

  @IsNumber({}, { message: 'La quantité doit être un nombre' })
  @Min(1, { message: 'La quantité minimum est 1' })
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix unitaire doit avoir max 2 décimales' })
  @Min(0.01, { message: 'Le prix minimum est 0.01' })
  unitPrice: number;
}

/**
 * DTO pour la création d'une commande
 * 
 * Validation stricte avec class-validator pour:
 * - Protéger contre les injections
 * - Garantir l'intégrité des données
 * - Retourner des erreurs 400 claires
 */
export class CreateOrderDto {
  /**
   * Email du client (identifiant)
   * @example "client@example.com"
   */
  @IsEmail({}, { message: 'L\'email doit être valide' })
  customerEmail: string;

  /**
   * Nom complet du client
   * @example "Jean Dupont"
   */
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @Length(2, 255, { message: 'Le nom doit faire entre 2 et 255 caractères' })
  customerName: string;

  /**
   * Adresse de livraison
   * @example "123 Rue de Paris, 75001 Paris"
   */
  @IsString({ message: 'L\'adresse de livraison doit être une chaîne' })
  @Length(5, 500, { message: 'L\'adresse doit faire entre 5 et 500 caractères' })
  shippingAddress: string;

  /**
   * Montant total de la commande
   * @example 99.99
   */
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Le montant doit être un nombre avec max 2 décimales' }
  )
  @Min(0.01, { message: 'Le montant minimum est 0.01' })
  @Max(999999.99, { message: 'Le montant maximum est 999999.99' })
  totalAmount: number;

  /**
   * Liste des items de la commande
   * @example [{"productId":"prod-001","productName":"Widget","quantity":2,"unitPrice":49.99}]
   */
  @IsArray({ message: 'Les items doivent être un tableau' })
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: 'Au moins un item est requis' })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

}
