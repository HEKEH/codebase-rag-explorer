# PRD 验收题集（20 题）

## 函数作用说明类
1. `RepoService.importRepo` 的主要职责是什么？
2. `SplitterService` 如何区分 function/class/generic chunk？
3. `IndexService.buildIndex` 在索引阶段做了哪些步骤？
4. `RetrievalService.retrieve` 如何确定 top-k 结果？
5. `AskService.ask` 如何保证回答只基于可追溯上下文？

## 模块位置查询类
6. 仓库导入 API 在哪里定义？
7. 索引状态查询 API 在哪里定义？
8. 问答 API 在哪里定义？
9. Embedding 生成逻辑在哪个文件？
10. 前端问答界面入口组件在哪里？

## 调用关系类
11. `/api/index/build` 会调用哪些核心服务？
12. `/api/ask` 依赖了哪些服务与配置？
13. 前端点击“构建索引”后的请求链路是什么？
14. 前端提交问题后的请求链路是什么？
15. 引用信息由哪个服务生成，数据来源是什么？

## 错误处理类
16. 未构建索引时 `/api/ask` 返回什么错误？
17. 无相关代码时 `/api/ask` 返回什么结构？
18. 仓库路径不存在时导入会返回什么？

## 参数与约束类
19. `DEFAULT_TOP_K`、`CHUNK_MAX_LENGTH`、`MAX_CONTEXT_TOKENS` 如何生效？
20. Git 导入目前支持哪些协议与限制？
