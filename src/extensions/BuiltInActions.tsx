import { useEffect } from "react";
import { registry } from "./registry";
import type { AppAction, ActionContext } from "./registry";

export function useRegisterBuiltInActions(context: ActionContext) {
  useEffect(() => {
    const actions: AppAction[] = [
      {
        id: "create-root",
        label: "ルートページを作成",
        description: "新しいルートページを追加します",
        shortcut: "Ctrl+Shift+N",
        tags: ["new", "root", "page", "ルート", "作成"],
        prefixes: ["/"],
        locations: ["command-palette", "shortcut", "sidebar-tools", "context-menu:sidebar", "context-menu:editor"],
        isDisabled: () => !context.canEditWorkspace,
        onExecute: () => context.addPage(null),
        order: 10,
      },
      {
        id: "create-child",
        label: "子ページを作成",
        description: "現在のページの子ページを追加します",
        shortcut: "Ctrl+N",
        tags: ["child", "sub", "子ページ", "作成"],
        prefixes: ["@"],
        locations: ["command-palette", "shortcut", "context-menu:page", "context-menu:editor"],
        isDisabled: () => !context.canEditSelected,
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.addPage(targetId);
        },
        order: 20,
      },
      {
        id: "rename-page",
        label: "名前を変更",
        description: "現在のページ名を変更します",
        shortcut: "Ctrl+R",
        tags: ["rename", "title", "名前変更", "ページ名"],
        prefixes: ["@"],
        locations: ["command-palette", "shortcut", "context-menu:page", "context-menu:editor"],
        isDisabled: () => !context.canEditSelected,
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.renamePage(targetId);
        },
        order: 30,
      },
      {
        id: "toggle-pin",
        label: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          const page = ctx.workspace.pages[targetId];
          return page?.isPinned ? "ピン留め解除" : "ピン留め";
        },
        description: "現在のページのピン留めを切り替えます",
        shortcut: "Ctrl+Shift+P",
        tags: ["pin", "favorite", "ピン", "固定"],
        prefixes: ["@"],
        locations: ["command-palette", "shortcut", "context-menu:page", "context-menu:editor"],
        isDisabled: () => !context.canEditSelected,
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.togglePin(targetId);
        },
        order: 40,
      },
      {
        id: "move-trash",
        label: "ごみ箱へ移動",
        description: "現在のページをごみ箱に移動します",
        shortcut: "Ctrl+Delete",
        tags: ["trash", "delete", "ごみ箱", "削除"],
        prefixes: ["@"],
        locations: ["command-palette", "shortcut", "context-menu:page", "context-menu:editor"],
        isDisabled: () => !context.canEditSelected,
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.movePageToTrash(targetId);
        },
        order: 50,
      },
      {
        id: "focus-search",
        label: "/search 検索にフォーカス",
        description: "検索欄へフォーカスします",
        shortcut: "Ctrl+K",
        tags: ["search", "find", "検索"],
        prefixes: ["/"],
        locations: ["command-palette", "shortcut"],
        onExecute: () => context.focusSearch(),
        order: 60,
      },
      {
        id: "export-json",
        label: "JSONエクスポート",
        description: "ワークスペースをJSON出力します",
        tags: ["export", "json", "backup", "出力"],
        prefixes: ["/"],
        locations: ["command-palette", "sidebar-tools"],
        onExecute: () => context.exportJson(),
        order: 70,
      },
      {
        id: "import-json",
        label: "JSONインポート",
        description: "JSONファイルを読み込みます",
        tags: ["import", "json", "読み込み"],
        prefixes: ["/"],
        locations: ["command-palette", "sidebar-tools"],
        isDisabled: () => !context.canEditWorkspace,
        onExecute: () => context.importJson(),
        order: 80,
      },
      {
        id: "toggle-trash-view",
        label: (ctx) => ctx.showTrash ? "通常表示へ切替" : "ごみ箱を表示",
        description: "通常表示とごみ箱表示を切り替えます",
        tags: ["trash", "view", "ごみ箱", "表示"],
        prefixes: ["/"],
        locations: ["command-palette", "sidebar-tools", "context-menu:sidebar"],
        onExecute: () => context.toggleTrashView(),
        order: 90,
      },
      {
        id: "open-help",
        label: "ヘルプを開く",
        description: "ショートカットとコマンド一覧を表示します",
        shortcut: "Ctrl+/",
        tags: ["help", "shortcut", "コマンド", "ヘルプ"],
        prefixes: ["/"],
        locations: ["command-palette", "shortcut", "sidebar-tools", "context-menu:sidebar"],
        onExecute: () => context.openHelp(),
        order: 100,
      },
      // New context-menu specific actions
      {
        id: "restore-page",
        label: "復元",
        locations: ["context-menu:page", "context-menu:editor"],
        isVisible: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          return ctx.workspace.pages[targetId]?.isTrashed === true;
        },
        onExecute: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          context.restorePage(targetId);
        },
        order: 110,
      },
      {
        id: "permanently-delete",
        label: "完全削除",
        locations: ["context-menu:page", "context-menu:editor"],
        isVisible: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          return ctx.workspace.pages[targetId]?.isTrashed === true;
        },
        onExecute: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          context.permanentlyDeletePage(targetId);
        },
        order: 120,
      },
      {
        id: "move-to-root",
        label: "ルートへ移動",
        locations: ["context-menu:page", "context-menu:editor"],
        isVisible: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          const page = ctx.workspace.pages[targetId];
          return page && page.parentId !== null && !page.isTrashed;
        },
        onExecute: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          context.movePageToRoot(targetId);
        },
        order: 130,
      },
      {
        id: "toggle-collapse",
        label: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          return ctx.collapsedPageIds.includes(targetId) ? "展開" : "折りたたむ";
        },
        locations: ["context-menu:page"],
        isVisible: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          const page = ctx.workspace.pages[targetId];
          return page && page.childrenIds.length > 0 && !page.isTrashed;
        },
        onExecute: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          context.togglePageCollapsed(targetId);
        },
        order: 140,
      },
      {
        id: "toggle-selection",
        label: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          return ctx.selectedPageIdSet.has(targetId) ? "選択解除" : "選択に追加";
        },
        locations: ["context-menu:page"],
        onExecute: (ctx) => {
          const targetId = ctx.targetId || ctx.selectedPageId;
          context.togglePageSelection(targetId);
        },
        order: 5,
      },
      {
        id: "duplicate-page",
        label: "ページを複製",
        description: "現在のページをコピーします",
        shortcut: "Ctrl+D",
        tags: ["duplicate", "copy", "clone", "複製", "コピー"],
        prefixes: ["@"],
        locations: ["command-palette", "shortcut", "context-menu:page", "context-menu:editor"],
        isDisabled: () => !context.canEditSelected,
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.duplicatePage(targetId);
        },
        order: 35,
      },
      {
        id: "copy-page-link",
        label: "リンクをコピー",
        description: "ページのリンクをクリップボードにコピーします",
        tags: ["link", "copy", "url", "リンク", "コピー"],
        prefixes: ["@"],
        locations: ["command-palette", "context-menu:page", "context-menu:editor"],
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          // In a real app, this might be a full URL. For now, ID.
          navigator.clipboard.writeText(`page-id:${targetId}`);
        },
        order: 150,
      },
      {
        id: "select-descendants",
        label: "子ページをすべて選択",
        description: "配下の子ページをすべて選択状態にします",
        tags: ["select", "child", "descendants", "一括選択"],
        locations: ["context-menu:page"],
        onExecute: (ctx) => {
          const targetId = ctx.targetId || context.selectedPageId;
          context.selectDescendants(targetId);
        },
        order: 160,
      },
      {
        id: "expand-all",
        label: "すべて展開",
        description: "すべてのツリーアイテムを展開します",
        tags: ["expand", "all", "すべて展開"],
        prefixes: ["/"],
        locations: ["command-palette", "context-menu:sidebar", "sidebar-tools"],
        onExecute: () => context.expandAllTreeNodes(),
        order: 170,
      },
      {
        id: "collapse-all",
        label: "すべて折りたたむ",
        description: "すべてのツリーアイテムを折りたたみます",
        tags: ["collapse", "all", "すべて折りたたむ"],
        prefixes: ["/"],
        locations: ["command-palette", "context-menu:sidebar", "sidebar-tools"],
        onExecute: () => context.collapseAllTreeNodes(),
        order: 180,
      },
      {
        id: "toggle-sidebar",
        label: (ctx) => ctx.isSidebarCollapsed ? "サイドバーを展開" : "サイドバーを隠す",
        description: "サイドバーの表示状態を切り替えます",
        shortcut: "Ctrl+\\",
        tags: ["sidebar", "layout", "サイドバー", "隠す", "展開"],
        prefixes: ["/"],
        locations: ["command-palette", "shortcut", "sidebar-tools"],
        onExecute: () => context.toggleSidebar(),
        order: 190,
      },
      {
        id: "page-move-up",
        label: "上のページへ移動",
        shortcut: "Alt+Up",
        locations: ["shortcut"],
        onExecute: (_ctx) => {
          // Simplified J/K logic could be added here if we had a flat visible list in context
        },
        order: 200,
      },
      {
        id: "page-move-down",
        label: "下のページへ移動",
        shortcut: "Alt+Down",
        locations: ["shortcut"],
        onExecute: (_ctx) => {
        },
        order: 210,
      },
      {
        id: "toggle-outline",
        label: (ctx) => ctx.isOutlineOpen ? "アウトラインを閉じる" : "アウトラインを開く",
        description: "ページの見出し一覧（アウトライン）の表示を切り替えます",
        shortcut: "Ctrl+Shift+O",
        tags: ["outline", "toc", "headings", "アウトライン", "目次", "見出し"],
        prefixes: ["/"],
        locations: ["command-palette", "shortcut", "sidebar-tools", "context-menu:editor"],
        onExecute: () => context.toggleOutline(),
        order: 195,
      }
    ];

    actions.forEach(action => registry.register(action));

    return () => {
      actions.forEach(action => registry.unregister(action.id));
    };
  }, [context]);
}
