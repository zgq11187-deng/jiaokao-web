---
name: 教考智联工作台
description: 清晰、可信、适合长时间学习和备课的教与学工作台；老师端专业高效，学生端亲和易懂。

colors:
  primary: "#2563EB"
  secondary: "#0F766E"
  tertiary: "#D97706"
  neutral: "#F8FAFC"
  surface: "#FFFFFF"
  border: "#E2E8F0"
  on-primary: "#FFFFFF"
  on-neutral: "#0F172A"
  muted: "#64748B"
  success: "#16A34A"
  warning: "#D97706"
  error: "#DC2626"

typography:
  h1:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: "1.2"
    letterSpacing: "0"
  h2:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: "1.3"
    letterSpacing: "0"
  h3:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.4"
    letterSpacing: "0"
  body:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.65"
    letterSpacing: "0"
  compact:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0"
  mono:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "0.875rem"
    lineHeight: "1.5"
    letterSpacing: "0"

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px

rounded:
  none: 0
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px

elevation:
  none: "none"
  sm: "0 1px 2px rgba(15, 23, 42, 0.06)"
  md: "0 8px 24px rgba(15, 23, 42, 0.08)"
  lg: "0 16px 40px rgba(15, 23, 42, 0.12)"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    typography: "{typography.compact}"
  button-primary-hover:
    backgroundColor: "#1D4ED8"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-neutral}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    typography: "{typography.compact}"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    elevation: "{elevation.none}"
    padding: "{spacing.lg}"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-neutral}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    typography: "{typography.compact}"
  badge:
    backgroundColor: "#EFF6FF"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "4px 8px"
    typography: "{typography.compact}"
---

## Overview
教考智联工作台采用“现代极简 + 友好教育”的设计方向。整体界面清晰、可信、克制，优先服务章节学习、题库练习、教师备课、学生授权和 Qwen / Codex Agent / Notion 教学页生成流程。

老师端更接近专业工作台，信息密度更高，适合批量查看章节、题库、学生申请和生成状态。学生端保持更舒展的阅读和答题节奏，让章节、练习、反馈更容易理解。

## Colors
主色使用教育蓝 `#2563EB`，用于主按钮、当前章节、关键操作和主要导航状态。辅助色 `#0F766E` 用于学习进度、完成状态和正向反馈。琥珀色 `#D97706` 用于重点提醒、待审核、风险和需要人工检查的状态。

背景使用浅灰白 `#F8FAFC`，避免纯白造成长时间阅读疲劳。主要内容面板使用白色，配合浅灰边框组织层级。错误状态使用红色 `#DC2626`，但任何错误、成功、待审核状态都必须同时配有文字说明，不能只靠颜色表达。

## Typography
字体使用系统中文字体优先，配合 Inter 表现英文、数字和界面标签。标题不做夸张展示，保持工作台语境中的清晰层级。正文默认 16px，适合学生阅读知识点和解析；教师端列表、表格和状态信息可使用 14px 紧凑字号。

代码、状态 ID、导出格式、日志和 Agent 运行标识使用 JetBrains Mono 或系统等宽字体。

## Layout
整体布局采用顶部导航 + 主内容区 + 可选侧栏的工作台结构。教师端可以使用左侧章节 / 功能导航，右侧展示详情、列表或生成流程。学生端页面优先单任务聚焦，例如当前章节、当前练习、当前模拟考试。

页面不使用营销落地页式大 hero。首页第一屏只承担入口分流和课程定位，不做大面积装饰。

## Elevation & Depth
默认使用边框和间距建立层级，少用阴影。卡片、章节列表、题目区域默认无阴影或极轻阴影。弹窗、下拉菜单、Toast、确认框和浮层可以使用中等阴影，帮助用户理解其覆盖关系。

## Shapes
组件圆角以 8px 为主，大面板最多 12px。按钮、输入框、章节卡片、题目卡片保持统一圆角。避免胶囊形大按钮和过度圆润的儿童化视觉。

## Components
章节卡片展示章节名、学习目标、资料数、练习数和状态。题目卡片保证题干清楚、选项点击区域足够大，答案解析默认可展开 / 收起。流程步骤卡展示 Qwen 原始页、A 考点、B 真题、C 教学页，每一步都有待处理、生成中、成功、失败、需人工检查状态。

教师授权列表展示姓名、手机号、申请时间、状态、通过 / 拒绝操作。教学页预览偏阅读排版，保留 Markdown / 课件结构，不加干扰性装饰。

## Do's and Don'ts
Do:
- 界面清楚、克制，优先保证学习和备课效率。
- 老师端适合长时间批量操作。
- 学生端章节、练习、反馈要容易理解。
- 流程状态必须明确。
- 题目、解析、教学页内容优先可读。
- 所有关键操作要有确认、反馈或可撤回提示。

Don't:
- 不要营销落地页式大 hero。
- 不要儿童化卡通风。
- 不要大面积渐变背景。
- 不要粒子、3D、玻璃拟态。
- 不要轮播图。
- 不要纯暗色默认模式。
- 不要只靠颜色表达状态。
- 不要把老师端做成低信息密度卡片墙。

## Motion & Animation
只使用微动效。按钮 hover、状态切换、上传进度、生成中、成功和失败反馈可以有 150-250ms 的淡入或位移。Qwen / Codex Agent 流程可以展示轻量进度状态，但不做复杂动画、滚动入场、hero 动画或粒子效果。

## Responsiveness
学生端必须适配手机，章节详情、题目、解析、模拟考试在移动端单列显示，按钮和选项保持足够点击面积。教师端优先桌面体验，移动端只保证查看和简单操作，复杂管理在桌面完成。

## Accessibility
目标为 WCAG AA。所有按钮、输入框、题目选项、Tabs、弹窗和菜单都必须支持键盘操作。答题结果、生成失败、未授权、待审核等状态必须有文字提示。动效尊重 `prefers-reduced-motion`。

## UI Framework Considerations
推荐使用 `shadcn/ui + Tailwind CSS + Radix UI`。这套组合适合表单、弹窗、Tabs、Toast、Dropdown、表格和工作台布局。图标使用 `lucide-react`。组件应保持可组合、可访问、可替换，避免重型 UI 框架锁死视觉细节。

## References & Inspiration
参考方向为 Notion、Linear、Cal.com、Pitch：取其清晰、克制、可长期使用的工作台气质，但不复制营销页式首页，也不做过度品牌化装饰。
