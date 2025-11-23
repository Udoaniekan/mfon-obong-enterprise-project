# New Transaction Types - API Documentation

## Overview
Two new transaction types have been added to the system: **RETURN** and **WHOLESALE**. This document provides the necessary information for frontend integration.

---

## 📦 RETURN Transaction Type

### Purpose
Handle product returns from previous transactions with automatic stock restoration and client balance adjustments.

### Endpoint
```
POST /api/transactions
```

### Authentication
Requires JWT token. Allowed roles: `SUPER_ADMIN`, `ADMIN`, `MAINTAINER`, `STAFF`

### Request Body
```json
{
  "type": "RETURN",
  "referenceTransactionId": "64f8a1234567890123456789",
  "reason": "Defective product",
  "clientId": "64f8a1234567890123456789",
  "branchId": "64f8a1234567890123456789",
  "returnedItems": [
    {
      "productId": "64f8a1234567890123456789",
      "quantity": 5,
      "unit": "Bag of Dangote"
    }
  ],
  "actualAmountReturned": 22500,
  "notes": "Customer returned 5 bags due to damage",
  "date": "2025-11-23T10:00:00Z"
}
```

### Required Fields
- `type`: Must be `"RETURN"`
- `referenceTransactionId`: ID of the original transaction being returned
- `reason`: Explanation for the return
- `returnedItems`: Array of items being returned
  - `productId`: Product ID
  - `quantity`: Number of items being returned
  - `unit`: Unit of measurement
- `actualAmountReturned`: Cash/credit amount given back to client
- `clientId`: Client ID (only registered clients)
- `branchId`: Branch ID

### Optional Fields
- `notes`: Additional notes
- `date`: Custom date for the return (defaults to current date)

### Business Rules
1. **Cannot return DEPOSIT or RETURN transactions** - Only PURCHASE, PICKUP, or WHOLESALE
2. **Return quantity validation** - Cannot exceed original purchase quantity
3. **Stock restoration** - Returned items automatically added back to inventory
4. **Price refund logic**:
   - If current price < original price: Refund at current (lower) price
   - If current price > original price: Refund at original price
5. **Client balance** - `actualAmountReturned` is deducted from client balance

### Response
```json
{
  "invoiceNumber": "INV25110045",
  "type": "RETURN",
  "clientId": "64f8a1234567890123456789",
  "items": [
    {
      "productId": "64f8a1234567890123456789",
      "productName": "Dangote Cement",
      "quantity": 5,
      "unit": "Bag of Dangote",
      "originalUnitPrice": 4500,
      "currentUnitPrice": 4300,
      "refundUnitPrice": 4300,
      "subtotal": 21500
    }
  ],
  "subtotal": 21500,
  "total": 21500,
  "totalRefundedAmount": 21500,
  "actualAmountReturned": 22500,
  "referenceTransactionId": "64f8a1234567890123456789",
  "reason": "Defective product",
  "status": "COMPLETED",
  "clientBalance": 23000,
  "_id": "64f8a1234567890123456789",
  "createdAt": "2025-11-23T10:00:00Z",
  "updatedAt": "2025-11-23T10:00:00Z"
}
```

### Error Responses
```json
{
  "statusCode": 400,
  "message": "referenceTransactionId is required for RETURN transactions"
}
```

```json
{
  "statusCode": 404,
  "message": "Original transaction not found"
}
```

```json
{
  "statusCode": 400,
  "message": "Cannot create a return for a DEPOSIT or RETURN transaction"
}
```

```json
{
  "statusCode": 400,
  "message": "Return quantity (10) exceeds purchased quantity (5) for product Dangote Cement"
}
```

---

## 🏗️ WHOLESALE Transaction Type

### Purpose
Record cement wholesale transactions for other companies without affecting inventory. Manual pricing required.

### Endpoint
```
POST /api/transactions
```

### Authentication
Requires JWT token. Allowed roles: `SUPER_ADMIN`, `ADMIN`, `MAINTAINER`, `STAFF`

### Request Body
```json
{
  "type": "WHOLESALE",
  "clientId": "64f8a1234567890123456789",
  "branchId": "64f8a1234567890123456789",
  "items": [
    {
      "productId": "64f8a1234567890123456789",
      "quantity": 50,
      "unit": "Bag of Dangote",
      "wholesalePrice": 4500,
      "discount": 0
    }
  ],
  "discount": 0,
  "transportFare": 2000,
  "loadingAndOffloading": 1500,
  "amountPaid": 227500,
  "paymentMethod": "bank_transfer",
  "notes": "Bulk order for ABC Construction Ltd",
  "date": "2025-11-23T10:00:00Z"
}
```

### Required Fields
- `type`: Must be `"WHOLESALE"`
- `clientId`: Client ID (registered clients only - **no walk-ins**)
- `branchId`: Branch ID
- `items`: Array of cement products
  - `productId`: Product ID (must be cement category)
  - `quantity`: Number of bags
  - `unit`: Unit of measurement
  - **`wholesalePrice`**: Manual wholesale price per unit (**REQUIRED**)

### Optional Fields
- `discount`: Discount amount
- `transportFare`: Transport charges
- `loading`: Loading charges
- `loadingAndOffloading`: Loading and offloading charges (mutually exclusive with `loading`)
- `amountPaid`: Amount paid (can be partial, zero, or full)
- `paymentMethod`: Payment method
- `notes`: Additional notes
- `date`: Custom date for the transaction (defaults to current date)

### Business Rules
1. **Cement products ONLY** - Only products from "Cement" category allowed
2. **Registered clients ONLY** - Walk-in clients cannot do wholesale transactions
3. **Manual pricing REQUIRED** - `wholesalePrice` must be provided for each item
4. **NO inventory impact**:
   - ❌ No stock validation (out of stock check skipped)
   - ❌ No stock deduction
   - ❌ Inventory levels remain unchanged
5. **Payment flexibility**:
   - Can create debt (like PICKUP)
   - Can use client credit balance (like PURCHASE)
   - Same balance/debt logic as regular transactions
6. **Charges**: Can have transport, loading, or loadingAndOffloading charges
7. **Revenue tracking**: Included in all revenue analytics

### Response
```json
{
  "invoiceNumber": "INV25110046",
  "type": "WHOLESALE",
  "clientId": "64f8a1234567890123456789",
  "items": [
    {
      "productId": "64f8a1234567890123456789",
      "productName": "Dangote Cement",
      "quantity": 50,
      "unit": "Bag of Dangote",
      "unitPrice": 4500,
      "wholesalePrice": 4500,
      "discount": 0,
      "subtotal": 225000
    }
  ],
  "subtotal": 225000,
  "discount": 0,
  "transportFare": 2000,
  "loadingAndOffloading": 1500,
  "total": 228500,
  "amountPaid": 227500,
  "status": "COMPLETED",
  "clientBalance": -1000,
  "_id": "64f8a1234567890123456789",
  "createdAt": "2025-11-23T10:00:00Z",
  "updatedAt": "2025-11-23T10:00:00Z"
}
```

### Error Responses
```json
{
  "statusCode": 400,
  "message": "WHOLESALE transactions are only allowed for registered clients"
}
```

```json
{
  "statusCode": 400,
  "message": "WHOLESALE transactions are only allowed for cement products. \"Iron Rod\" is not a cement product."
}
```

```json
{
  "statusCode": 400,
  "message": "Wholesale price is required and must be greater than 0 for product Dangote Cement"
}
```

```json
{
  "statusCode": 400,
  "message": "Transaction blocked: Client \"ABC Company\" is currently suspended. Please contact admin to reactivate this client."
}
```

---

## 🧪 Testing with Calculate Endpoint

Before creating a transaction, you can use the calculate endpoint to preview totals:

### Endpoint
```
POST /api/transactions/calculate
```

### RETURN Calculation
⚠️ **Note**: RETURN transactions cannot be pre-calculated. They must be created directly.

### WHOLESALE Calculation
```json
{
  "type": "WHOLESALE",
  "clientId": "64f8a1234567890123456789",
  "branchId": "64f8a1234567890123456789",
  "items": [
    {
      "productId": "64f8a1234567890123456789",
      "quantity": 50,
      "unit": "Bag of Dangote",
      "wholesalePrice": 4500
    }
  ],
  "transportFare": 2000,
  "amountPaid": 100000
}
```

Response:
```json
{
  "subtotal": 225000,
  "discount": 0,
  "transportFare": 2000,
  "loadingAndOffloading": 0,
  "loading": 0,
  "total": 227000,
  "clientBalance": 50000,
  "requiredPayment": 177000,
  "canUseCreditBalance": true,
  "message": "WHOLESALE: Minimum payment 177000 (to avoid debt). You can pay more, excess becomes credit. Current balance: 50000",
  "items": [...]
}
```

---

## 📊 Transaction Types Summary

| Type | Clients | Stock Impact | Pricing | Balance/Debt |
|------|---------|--------------|---------|--------------|
| PURCHASE | Registered or Walk-in | ✅ Deducts | Retail | No debt |
| PICKUP | Registered only | ✅ Deducts | Retail | Creates debt |
| DEPOSIT | Registered only | ❌ None | N/A | Adds credit |
| **RETURN** | Registered only | ✅ **Adds back** | Refund logic | Deducts from balance |
| **WHOLESALE** | Registered only | ❌ **None** | **Manual** | Flexible (debt/credit) |

---

## 🔑 Important Notes for Frontend

### RETURN Transactions:
1. Show original transaction details before creating return
2. Validate return quantities against original purchase
3. Display refund calculation preview
4. Require reason input (mandatory field)
5. Only allow returns for PURCHASE, PICKUP, or WHOLESALE transactions

### WHOLESALE Transactions:
1. **Filter products**: Only show cement category products
2. **Price input**: Show `wholesalePrice` input field (required, not optional)
3. **Stock display**: Hide/remove stock availability checks
4. **Client filter**: Only registered clients, disable walk-in option
5. **Payment**: Same UI as PURCHASE/PICKUP (can create debt)
6. **Validation**: Ensure `wholesalePrice > 0` before submission

---

## 📝 Full Transaction Type Enum

```typescript
enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  PURCHASE = 'PURCHASE', 
  PICKUP = 'PICKUP',
  RETURN = 'RETURN',     // NEW
  WHOLESALE = 'WHOLESALE' // NEW
}
```

---

## ⚠️ Common Validation Errors

### Both Types:
- `400`: "Transaction blocked: Client is currently suspended"
- `404`: "Client not found"
- `404`: "Product not found"
- `400`: "Invalid unit for product"

### RETURN Specific:
- `400`: "referenceTransactionId is required"
- `400`: "reason is required"
- `400`: "returnedItems are required"
- `400`: "actualAmountReturned is required and must be >= 0"
- `404`: "Original transaction not found"
- `400`: "Cannot create a return for a DEPOSIT or RETURN transaction"

### WHOLESALE Specific:
- `400`: "WHOLESALE transactions are only allowed for registered clients"
- `400`: "WHOLESALE transactions are only allowed for cement products"
- `400`: "Wholesale price is required and must be greater than 0"
- `400`: "Items are required for WHOLESALE transactions"

---

**Last Updated**: November 23, 2025