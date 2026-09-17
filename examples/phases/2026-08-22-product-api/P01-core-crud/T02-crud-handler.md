# Task: T02 상품 CRUD 핸들러 및 서비스 구현

## Status: in_progress

## Goal
상품 등록, 목록 조회(페이징/필터), 단건 조회, 수정, 삭제를 처리하는 컨트롤러 및 서비스 레이어 구현

## Decision Summary
- D01: 상품 생성 시 하위 Variant 목록을 트랜잭션으로 원자적(Atomic) 일괄 생성
- D02: 목록 조회 시 기본 페이징(limit: 20, offset: 0) 및 상태 필터링 지원

## Implementation

### I01. ProductService 비즈니스 로직 구현

- Related Files:
  - `src/services/product.service.ts` :: `ProductService` — 비즈니스 로직 및 트랜잭션 처리; new
  - `src/dto/product.dto.ts` :: `CreateProductDto, UpdateProductDto, QueryProductDto` — 입출력 DTO; new

#### Details
- **Signatures & Types**:
  ```typescript
  export interface CreateProductDto {
    name: string;
    description?: string;
    variants: Array<{ color: string; size: string; price: number; stock: number; sku: string }>;
  }

  export class ProductService {
    async createProduct(dto: CreateProductDto): Promise<ProductWithVariants>;
    async getProductById(id: string): Promise<ProductWithVariants>;
    async listProducts(query: QueryProductDto): Promise<{ items: Product[]; total: number }>;
    async updateProduct(id: string, dto: UpdateProductDto): Promise<Product>;
    async deleteProduct(id: string): Promise<boolean>;
  }
  ```
- **Execution Flow / Logic**:
  1. `createProduct`:
     - DTO 유효성 검증 ➔ DB 트랜잭션 시작
     - `Product` 레코드 생성 ➔ 각 `Variant`에 `productId` 매핑 후 일괄 생성
     - SKU 중복 발생 시 Rollback 및 `DuplicateSkuException (HTTP 409)` 발생
     - 성공 시 생성된 전체 엔티티 반환
  2. `deleteProduct`:
     - 상품 존재 여부 확인 (미존재 시 `NotFoundException (HTTP 404)`)
     - 삭제 수행 (CASCADE로 하위 Variant 자동 정리)

### I02. ProductController REST API 라우트 구현

- Related Files:
  - `src/controllers/product.controller.ts` :: `ProductController` — HTTP 엔드포인트 라우팅; new

#### Details
- **API Endpoints**:
  - `POST /api/v1/products` ➔ `201 Created` / `400 Bad Request` / `409 Conflict`
  - `GET /api/v1/products` ➔ `200 OK { items: [], total: number }`
  - `GET /api/v1/products/:id` ➔ `200 OK` / `404 Not Found`
  - `PUT /api/v1/products/:id` ➔ `200 OK` / `404 Not Found`
  - `DELETE /api/v1/products/:id` ➔ `204 No Content` / `404 Not Found`

## Acceptance Criteria
- [ ] 상품 및 하위 옵션이 트랜잭션 내에서 원자적으로 생성되어야 함
- [ ] 존재하지 않는 상품 조회/수정/삭제 시 404 에러가 반환되어야 함
- [ ] 전체 API 유닛/통합 테스트가 100% 통과해야 함

## Validation
- `pnpm test tests/controllers/product.controller.spec.ts` — all passed

## Commit Message
```text
feat(product): implement CRUD controllers and service

Plan: 2026-08-22-product-api
Phase: P01-core-crud
Task: T02-crud-handler

- Implement ProductService with transactional batch variant creation
- Add ProductController RESTful endpoints with error handling
- Add controller integration tests for CRUD lifecycle
```

## Progress
- [ ] 구현 완료
- [ ] 검증 통과
- commit: pending
