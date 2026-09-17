# Task: T01 Product 및 Variant 스키마 정의

## Status: done

## Goal
상품 기본 정보(Product)와 옵션별 독립 재고(Variant) 관리를 위한 1:N 관계의 데이터베이스 모델 스키마 및 유효성 검증 로직 정의

## Decision Summary
- D01: 가격 및 재고는 Variant 단위로 독립 관리
- D02: Product 삭제 시 하위 Variant는 CASCADE 삭제 처리

## Implementation

### I01. Product & Variant 모델 스키마 정의

- Related Files:
  - `src/models/product.ts` :: `Product` — 상품 기본 엔티티 정의; new
  - `src/models/variant.ts` :: `Variant` — 상품 하위 옵션 엔티티 정의; new
  - `src/models/types.ts` :: `ProductStatus, VariantOption` — 공통 타입 정의; new

#### Details
- **Signatures & Types**:
  ```typescript
  export type ProductStatus = 'draft' | 'active' | 'archived';

  export interface Product {
    id: string; // UUID v4
    name: string; // 1~100자
    description?: string;
    status: ProductStatus;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Variant {
    id: string; // UUID v4
    productId: string; // FK -> Product.id
    sku: string; // e.g. "PROD-RED-L" (Unique)
    color: string;
    size: string;
    price: number; // 원화 정수 (>= 0)
    stock: number; // 재고 수량 (>= 0)
  }
  ```
- **Data & Schema Constraints**:
  - `Product.name`: Null 불가, Trim 적용, 빈 문자열 불가
  - `Variant.sku`: Unique 인덱스 적용, 중복 SKU 저장 시 `DuplicateSkuError` 발생
  - `Variant.price`: 0원 이상 정수 제약
  - `Variant.stock`: 0 이상 정수 제약 (음수 불가)
  - `Relation`: Product (1) : Variant (N) — `onDelete: CASCADE`

### I02. 스키마 유효성 검증 유닛 테스트 작성

- Related Files:
  - `tests/models/product.spec.ts` :: `describe('Product Schema Validation')` — 모델 생성 및 검증 테스트; new

#### Details
- **Test Scenarios**:
  1. 유효한 Product 및 Variant 인스턴스 생성 검증
  2. 음수 가격 또는 음수 재고 입력 시 유효성 에러 검증
  3. 필수 필드 누락 시 유효성 에러 검증

## Acceptance Criteria
- [x] `Product` 및 `Variant` 인터페이스와 유효성 검증 함수가 구현되어야 함
- [x] 유닛 테스트(`product.spec.ts`)가 에러 없이 모두 통과해야 함

## Validation
- `pnpm test tests/models/product.spec.ts` — 3 passed (100%)

## Commit Message
```text
feat(product): add Product and Variant schema definitions

Plan: 2026-08-22-product-api
Phase: P01-core-crud
Task: T01-product-schema

- Define Product and Variant entities with 1:N CASCADE relation
- Add SKU uniqueness and price/stock non-negative constraints
- Add unit tests for schema validation
```

## Progress
- [x] 구현 완료
- [x] 검증 통과
- commit: a1b2c3d
