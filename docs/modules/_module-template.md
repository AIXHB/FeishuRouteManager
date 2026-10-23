---
id: module-example
type: module
layer: 3
module: module-example
status: draft
summary: 模块职责的一句话说明
load_when: [example]
globs: [src/example/**]
related: []
depends_on: []
key_files: [src/example/index.js]
implements: []
public_api: []
tests: []
last_updated: YYYY-MM-DD
token_est: 0
---

# 模块标题

## 职责与边界

说明模块负责和不负责的内容。

## 关键文件与代码结构

- `src/example/index.js`：代码入口与作用。

## API、数据流与不变量

写明准确符号、调用关系、错误处理和必须保持的约束。

## 测试与已知陷阱

- 测试入口与容易踩坑的细节。

## 关联

使用 `[[document-id]]` 关联设计和 ADR。
