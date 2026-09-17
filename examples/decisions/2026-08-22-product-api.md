# Decisions: 쇼핑몰 상품 API

- Date: 2026-08-22
- Status: Confirmed

## D01. 인증 방식
- **Chosen**: JWT Bearer 토큰 인증 (Authorization 헤더)
- **Rationale**: MSA 구조 확장을 고려하여 상태 저장이 없는 Stateless 토큰 방식을 채택함.

## D02. 상품 옵션 (Variant) 구조
- **Chosen**: Product 1 : N Variant 관계 (색상/사이즈별 독립 재고 관리)
- **Rationale**: SKU 단위로 가격과 재고를 분리하여 재고 품절 및 옵션별 추가금 처리를 유연하게 지원함.
