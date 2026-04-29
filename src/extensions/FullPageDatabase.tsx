import React, { useMemo, useState } from "react";
import { 
  Box, Group, Text, ActionIcon, Button, Paper, Menu, Checkbox, 
  Select as MantineSelect, MultiSelect as MantineMultiSelect, 
  Tabs, Badge, Stack, Card, Tooltip
} from "@mantine/core";
import { 
  IconPlus, IconTrash, IconAbc, IconNumbers, IconChevronDown, 
  IconCalendar, IconCircleCheck, IconList, IconTable, 
  IconLayoutKanban, IconLayoutList, IconPhoto, IconFilter, 
  IconSortAscending, IconEye, IconEyeOff, IconSettings, 
  IconChevronLeft, IconChevronRight, IconFunction, IconTag, IconSearch,
  IconLink, IconTimeline
} from "@tabler/icons-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { DatePickerInput } from "@mantine/dates";
import { DebouncedInput } from "./DebouncedInput";
import type { 
  DatabaseColumn, DatabaseColumnType, DatabaseView, 
  DatabaseViewType, DatabaseFilterOperator 
} from "../App";
import dayjs from "dayjs";

type DatabasePageLike = {
  id: string;
  title: string;
  properties?: Record<string, string>;
  isTrashed?: boolean;
  kind?: "page" | "database";
  parentId?: string | null;
  childrenIds?: string[];
  databaseColumns?: Array<DatabaseColumn | string>;
  databaseViews?: DatabaseView[];
  currentViewId?: string;
};

type WorkspaceLike = {
  pages: Record<string, DatabasePageLike>;
};

type UpdatePageFn = (pageId: string, updates: Record<string, unknown>) => void;
type UpdateCellFn = (pageId: string, colId: string, value: string | boolean) => void;
type UpdateColumnFn = (index: number, updates: Partial<DatabaseColumn>) => void;
type AddPageFn = (pageId: string, properties?: Record<string, string>) => void;
type DeletePageFn = (pageId: string) => void;
type RemoveColumnFn = (index: number) => void;
type AddColumnFn = () => void;

// --- Helpers ---
const calculateFormula = (row: DatabasePageLike, col: DatabaseColumn, columns: DatabaseColumn[], visited = new Set<string>()) => {
  if (!col.formula || visited.has(col.id)) return "Circular!";
  visited.add(col.id);

  let expression = col.formula;
  columns.forEach(c => {
    if (c.id === col.id) return;
    
    let val = "";
    if (c.type === 'formula') {
      val = calculateFormula(row, c, columns, visited);
    } else {
      val = row.properties?.[c.id] || (c.type === 'number' ? '0' : '');
    }

    const pattern = new RegExp(`{{${c.name}}}|{{${c.id}}}`, "g");
    expression = expression.replace(pattern, isNaN(Number(val)) ? `"${val}"` : val);
  });

  try {
    const result = Function(`"use strict"; return (${expression});`)();
    return String(result);
  } catch {
    return "Error";
  } finally {
    visited.delete(col.id);
  }
};

const getIconForType = (type: DatabaseColumnType) => {
  switch (type) {
    case "number": return <IconNumbers size={14} />;
    case "checkbox": return <IconCircleCheck size={14} />;
    case "date": return <IconCalendar size={14} />;
    case "select": return <IconList size={14} />;
    case "multi-select": return <IconTag size={14} />;
    case "formula": return <IconFunction size={14} />;
    case "relation": return <IconLink size={14} />;
    default: return <IconAbc size={14} />;
  }
};

// --- Sub-components ---

type InputVariant = React.ComponentProps<typeof DebouncedInput>["variant"];

const PropertyCell = ({ rowPage, col, columns, workspace, updateCell, variant = "unstyled", readOnly = false }: { rowPage: DatabasePageLike, col: DatabaseColumn, columns: DatabaseColumn[], workspace: WorkspaceLike, updateCell: UpdateCellFn, variant?: InputVariant, readOnly?: boolean }) => {
  const value = rowPage.properties?.[col.id] || "";

  if (col.type === 'formula') {
      return <Text size="sm" p="xs" fw={500}>{calculateFormula(rowPage, col, columns)}</Text>;
  }

  switch (col.type) {
    case "checkbox":
      return (
        <Box style={{ padding: "8px 12px", display: 'flex', alignItems: 'center', height: '100%' }}>
          <Checkbox 
            checked={value === "true"} 
            onChange={(e) => !readOnly && updateCell(rowPage.id, col.id, e.currentTarget.checked)}
            disabled={readOnly}
          />
        </Box>
      );
    case "number":
      return (
        <DebouncedInput
          variant={variant}
          value={value}
          onChange={(v) => !readOnly && updateCell(rowPage.id, col.id, v)}
          placeholder="..."
          readOnly={readOnly}
          styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
        />
      );
    case "date":
       return (
         <DatePickerInput
           variant={variant}
           value={value ? dayjs(value).toDate() : null}
           onChange={(d) => !readOnly && updateCell(rowPage.id, col.id, d ? dayjs(d).format("YYYY-MM-DD") : "")}
           placeholder="..."
           disabled={readOnly}
           styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
         />
       );
    case "select":
      return (
        <MantineSelect
          variant={variant}
          data={col.options || []}
          value={value}
          onChange={(v) => {
            if (v !== null && !readOnly) updateCell(rowPage.id, col.id, v);
          }}
          placeholder="..."
          searchable
          readOnly={readOnly}
          styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
        />
      );
    case "multi-select":
      let selected: string[] = [];
      try { selected = JSON.parse(value || "[]"); } catch { selected = value ? value.split(",") : []; }
      return (
        <MantineMultiSelect
          variant={variant}
          data={col.options || []}
          value={selected}
          onChange={(v) => !readOnly && updateCell(rowPage.id, col.id, JSON.stringify(v))}
          placeholder="..."
          searchable
          readOnly={readOnly}
          styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
        />
      );
    case "relation":
      const relatedDbId = col.relatedDatabaseId;
      const relatedDb = relatedDbId ? workspace.pages[relatedDbId] : null;
      const relatedPages = relatedDb ? (relatedDb.childrenIds || []).map((id: string) => workspace.pages[id]).filter((p): p is DatabasePageLike => Boolean(p && !p.isTrashed)) : [];
      const relationData = relatedPages.map((p) => ({ label: p.title || "無題", value: p.id }));
      let selectedRelations: string[] = [];
      try { selectedRelations = JSON.parse(value || "[]"); } catch { selectedRelations = value ? [value] : []; }
      
      return (
        <MantineMultiSelect
          variant={variant}
          data={relationData}
          value={selectedRelations}
          onChange={(v) => !readOnly && updateCell(rowPage.id, col.id, JSON.stringify(v))}
          placeholder={relatedDb ? `${relatedDb.title}を選択...` : "データベース未選択"}
          searchable
          readOnly={readOnly || !relatedDb}
          styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
        />
      );
    default:
      return (
        <DebouncedInput
          variant={variant}
          value={value}
          onChange={(v) => !readOnly && updateCell(rowPage.id, col.id, v)}
          placeholder="..."
          readOnly={readOnly}
          styles={{ input: { padding: variant === "unstyled" ? "8px 12px" : "4px 8px" } }}
        />
      );
  }
};

const DatabaseTableView = ({ columns, visibleColumns, rows, workspace, updatePage, deletePage, addPage, updateColumn, addColumn, removeColumn, updateCell, pageId }: {
  columns: DatabaseColumn[];
  visibleColumns: DatabaseColumn[];
  rows: DatabasePageLike[];
  workspace: WorkspaceLike;
  updatePage: UpdatePageFn;
  deletePage: DeletePageFn;
  addPage: AddPageFn;
  updateColumn: UpdateColumnFn;
  addColumn: AddColumnFn;
  removeColumn: RemoveColumnFn;
  updateCell: UpdateCellFn;
  pageId: string;
}) => {
  const calculateSummary = (col: DatabaseColumn) => {
    if (col.type === 'number' || col.type === 'formula') {
      const vals = rows.map((r) => {
          const v = col.type === 'formula' ? calculateFormula(r, col, columns) : (r.properties?.[col.id] || "0");
          return Number(v);
      }).filter((n) => !isNaN(n));
      
      if (vals.length === 0) return "合計: 0";
      const sum = vals.reduce((a, b) => a + b, 0);
      return `合計: ${sum.toLocaleString()}`;
    }
    return `個数: ${rows.length}`;
  };

  return (
    <Paper shadow="sm" radius="md" withBorder style={{ overflowX: "auto", overflowY: "hidden", minHeight: 150 }}>
      <Box style={{ display: 'grid', gridTemplateColumns: `minmax(200px, 1fr) repeat(${visibleColumns.length}, minmax(150px, 1fr)) 50px` }}>
        <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "10px 16px", backgroundColor: "var(--mantine-color-gray-1)" }}>
          <Text fw={700} size="xs" c="dimmed" tt="uppercase">タイトル</Text>
        </Box>
        {visibleColumns.map((col) => (
           <Box key={col.id} style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "4px 8px", backgroundColor: "var(--mantine-color-gray-1)" }}>
             <Group wrap="nowrap" gap="xs" justify="space-between">
               <Menu shadow="md" width={220} position="bottom-start" closeOnItemClick={false}>
                 <Menu.Target>
                   <Group wrap="nowrap" gap="xs" style={{ cursor: 'pointer', flex: 1 }}>
                     {getIconForType(col.type)}
                     <Text size="xs" fw={700} c="dimmed" truncate>{col.name}</Text>
                     <IconChevronDown size={12} color="var(--mantine-color-gray-5)" />
                   </Group>
                 </Menu.Target>
                 <Menu.Dropdown>
                   <Menu.Label>プロパティ名</Menu.Label>
                   <Box p="xs">
                     <DebouncedInput size="xs" value={col.name} onChange={(v) => updateColumn(columns.findIndex((c) => c.id === col.id), { name: v })} />
                   </Box>
                   {(col.type === "select" || col.type === "multi-select") && (
                     <>
                       <Menu.Label>選択肢の管理</Menu.Label>
                       <Box p="xs">
                         <DebouncedInput 
                           size="xs" 
                           placeholder="例: 未着手, 進行中, 完了"
                           value={col.options?.join(", ") || ""} 
                           onChange={(v) => updateColumn(columns.findIndex((c) => c.id === col.id), { options: v.split(",").map(s => s.trim()).filter(Boolean) })}
                         />
                       </Box>
                     </>
                   )}
                   {col.type === "formula" && (
                      <>
                        <Menu.Label>数式</Menu.Label>
                        <Box p="xs">
                          <DebouncedInput 
                            size="xs" 
                            placeholder="数式を入力..."
                            value={col.formula || ""} 
                            onChange={(v) => updateColumn(columns.findIndex((c) => c.id === col.id), { formula: v })}
                          />
                        </Box>
                      </>
                   )}
                   <Menu.Divider />
                   <Menu.Label>種類</Menu.Label>
                   <Menu.Item leftSection={<IconAbc size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "text" })}>テキスト</Menu.Item>
                   <Menu.Item leftSection={<IconNumbers size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "number" })}>数値</Menu.Item>
                   <Menu.Item leftSection={<IconList size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "select" })}>セレクト</Menu.Item>
                   <Menu.Item leftSection={<IconTag size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "multi-select" })}>マルチセレクト</Menu.Item>
                   <Menu.Item leftSection={<IconCircleCheck size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "checkbox" })}>チェックボックス</Menu.Item>
                   <Menu.Item leftSection={<IconCalendar size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "date" })}>日付</Menu.Item>
                   <Menu.Item leftSection={<IconFunction size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "formula" })}>関数</Menu.Item>
                   <Menu.Item leftSection={<IconLink size={14}/>} onClick={() => updateColumn(columns.findIndex((c) => c.id === col.id), { type: "relation" })}>リレーション</Menu.Item>
                   {col.type === 'relation' && (
                     <>
                       <Menu.Divider />
                       <Menu.Label>関連データベース</Menu.Label>
                       <Box p="xs">
                         <MantineSelect 
                            size="xs" 
                            placeholder="データベースを選択"
                            data={Object.values(workspace.pages).filter((p) => p.kind === 'database' && p.id !== pageId && !p.isTrashed).map((p) => ({ label: p.title, value: p.id }))}
                            value={col.relatedDatabaseId || ""}
                            onChange={(v) => updateColumn(columns.findIndex((c) => c.id === col.id), { relatedDatabaseId: v || undefined })}
                         />
                       </Box>
                     </>
                   )}
                   <Menu.Divider />
                   <Menu.Item color="red" leftSection={<IconTrash size={14}/>} onClick={() => removeColumn(columns.findIndex((c) => c.id === col.id))}>削除</Menu.Item>
                 </Menu.Dropdown>
               </Menu>
             </Group>
           </Box>
        ))}
        <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", backgroundColor: "var(--mantine-color-gray-1)", padding: "8px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <ActionIcon onClick={addColumn} variant="subtle" color="gray"><IconPlus size={16}/></ActionIcon>
        </Box>

        {rows.map((rowPage) => (
          <React.Fragment key={rowPage.id}>
            <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", borderRight: "1px solid var(--mantine-color-gray-2)", padding: "0 4px", display: "flex", alignItems: "center" }}>
              <DebouncedInput
                  variant="unstyled"
                  value={rowPage.title}
                  onChange={(v) => updatePage(rowPage.id, { title: v })}
                  placeholder="無題のページ"
                  fw={600}
                  styles={{ input: { padding: "8px 12px", cursor: "text" } }}
              />
            </Box>
            {visibleColumns.map((col) => (
              <Box key={col.id} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", borderRight: "1px solid var(--mantine-color-gray-2)" }}>
                 <PropertyCell rowPage={rowPage} col={col} columns={columns} workspace={workspace} updateCell={updateCell} />
              </Box>
            ))}
            <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", padding: "8px", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <ActionIcon color="red" variant="subtle" onClick={() => deletePage(rowPage.id)}><IconTrash size={16}/></ActionIcon>
            </Box>
          </React.Fragment>
        ))}

        <Box style={{ borderTop: "2px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "8px 16px", backgroundColor: "var(--mantine-color-gray-0)" }}>
           <Text size="xs" fw={700} c="dimmed">個数: {rows.length}</Text>
        </Box>
        {visibleColumns.map((col) => (
           <Box key={`footer-${col.id}`} style={{ borderTop: "2px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "8px 12px", backgroundColor: "var(--mantine-color-gray-0)" }}>
              <Text size="xs" fw={700} c="dimmed">{calculateSummary(col)}</Text>
           </Box>
        ))}
        <Box style={{ borderTop: "2px solid var(--mantine-color-gray-3)", backgroundColor: "var(--mantine-color-gray-0)" }} />
      </Box>
      <Box p="md">
        <Button variant="subtle" size="sm" color="gray" leftSection={<IconPlus size={16}/>} onClick={() => addPage(pageId)}>新規行を追加</Button>
      </Box>
    </Paper>
  );
};

const DatabaseListView = ({ rows, visibleColumns, columns, updatePage, deletePage, addPage, pageId }: {
  rows: DatabasePageLike[];
  visibleColumns: DatabaseColumn[];
  columns: DatabaseColumn[];
  updatePage: UpdatePageFn;
  deletePage: DeletePageFn;
  addPage: AddPageFn;
  pageId: string;
}) => (
  <Stack gap="xs">
    {rows.map((row) => (
      <Paper key={row.id} withBorder p="sm" radius="md" shadow="xs">
        <Group justify="space-between">
          <Group gap="md">
            <DebouncedInput
              variant="unstyled"
              value={row.title}
              onChange={(v) => updatePage(row.id, { title: v })}
              placeholder="無題"
              fw={600}
              style={{ fontSize: 16 }}
            />
            <Group gap="xs">
              {visibleColumns.map((col) => {
                let val = col.type === 'formula' ? calculateFormula(row, col, columns) : (row.properties?.[col.id]);
                if (!val || col.type === "checkbox") return null;
                if (col.type === 'multi-select') {
                  try { val = JSON.parse(val).join(", "); } catch { /* ignore */ }
                }
                return <Badge key={col.id} variant="light" color="gray" size="sm">{col.name}: {val}</Badge>;
              })}
            </Group>
          </Group>
          <ActionIcon color="red" variant="subtle" size="sm" onClick={() => deletePage(row.id)}><IconTrash size={14}/></ActionIcon>
        </Group>
      </Paper>
    ))}
    <Button variant="light" color="gray" fullWidth leftSection={<IconPlus size={16}/>} onClick={() => addPage(pageId)}>新規アイテムを追加</Button>
  </Stack>
);

const DatabaseKanbanView = ({ rows, visibleColumns, columns, currentView, updatePage, addPage, pageId, updateCell }: {
  rows: DatabasePageLike[];
  visibleColumns: DatabaseColumn[];
  columns: DatabaseColumn[];
  currentView: DatabaseView;
  updateCurrentView: (updates: Partial<DatabaseView>) => void;
  updatePage: UpdatePageFn;
  addPage: AddPageFn;
  pageId: string;
  updateCell: UpdateCellFn;
}) => {
  const groupby = currentView.groupByColumnId || columns.find((c) => (c.type === "select" || c.type === "checkbox"))?.id || "status";
  const groupCol = columns.find((c) => c.id === groupby);
  
  let groups: { label: string, value: string }[] = [];
  if (groupCol?.type === "select" || groupCol?.type === "multi-select") {
    groups = (groupCol.options || []).map((o) => ({ label: o, value: o }));
    groups.push({ label: "未設定", value: "" });
  } else if (groupCol?.type === "checkbox") {
    groups = [{ label: "完了", value: "true" }, { label: "未完了", value: "false" }];
  } else {
    const values = Array.from(new Set(rows.map((r) => r.properties?.[groupby] || "")));
    groups = values.map((v) => ({ label: v || "未設定", value: v || "" }));
  }

  const onDragEnd = (result: { destination?: { droppableId: string } | null; draggableId: string }) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newValue = destination.droppableId;
    updateCell(draggableId, groupby, newValue);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Box className="kanban-board">
        {groups.map(group => (
          <Droppable key={group.value} droppableId={group.value}>
            {(provided) => (
              <Box 
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="kanban-column"
              >
                <Group justify="space-between" mb="md" px="xs">
                  <Group gap="xs">
                    <Text fw={700} size="sm">{group.label}</Text>
                    <Badge variant="filled" color="gray" size="xs">
                      {rows.filter((r) => {
                          const val = r.properties?.[groupby] || "";
                          if (groupCol?.type === 'multi-select') return val.includes(group.value);
                          return val === group.value;
                      }).length}
                    </Badge>
                  </Group>
                </Group>
                <Box style={{ flex: 1, minHeight: 100 }}>
                  {rows
                    .filter((r) => {
                        const val = r.properties?.[groupby] || "";
                        if (groupCol?.type === 'multi-select') return val.includes(group.value);
                        return val === group.value;
                    })
                    .map((row, index: number) => (
                      <Draggable key={row.id} draggableId={row.id} index={index}>
                        {(provided, snapshot) => (
                          <Box 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`kanban-card ${snapshot.isDragging ? 'dragging' : ''}`}
                          >
                            <DebouncedInput
                              variant="unstyled"
                              value={row.title}
                              onChange={(v) => updatePage(row.id, { title: v })}
                              placeholder="無題"
                              fw={600}
                              size="sm"
                              mb="xs"
                            />
                            <Stack gap={4}>
                              {visibleColumns.filter((c) => c.id !== groupby).slice(0, 3).map((c) => {
                                let val = c.type === 'formula' ? calculateFormula(row, c, columns) : (row.properties?.[c.id] || "...");
                                if (c.type === 'multi-select') { try { val = JSON.parse(val).join(", "); } catch { /* ignore */ } }
                                if (c.type === 'relation') { try { val = `🔗 ${JSON.parse(val).length} items`; } catch { val = '🔗 0 items'; } }
                                return (
                                  <Group key={c.id} gap={4} wrap="nowrap">
                                    {getIconForType(c.type)}
                                    <Text size="xs" truncate c="dimmed">{val}</Text>
                                  </Group>
                                );
                              })}
                            </Stack>
                          </Box>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </Box>
                <Button variant="subtle" size="xs" color="gray" mt="sm" leftSection={<IconPlus size={14}/>} onClick={() => addPage(pageId, group.value ? { [groupby]: group.value } : {})}>
                  新規
                </Button>
              </Box>
            )}
          </Droppable>
        ))}
      </Box>
    </DragDropContext>
  );
};

const DatabaseGalleryView = ({ rows, visibleColumns, columns, workspace, updatePage, deletePage, addPage, updateCell, pageId }: {
  rows: DatabasePageLike[];
  visibleColumns: DatabaseColumn[];
  columns: DatabaseColumn[];
  workspace: WorkspaceLike;
  updatePage: UpdatePageFn;
  deletePage: DeletePageFn;
  addPage: AddPageFn;
  updateCell: UpdateCellFn;
  pageId: string;
}) => (
  <Box className="gallery-grid">
    {rows.map((row) => (
      <Card key={row.id} className="gallery-card" withBorder padding="md">
        <Card.Section withBorder inheritPadding py="xs">
          <DebouncedInput
            variant="unstyled"
            value={row.title}
            onChange={(v) => updatePage(row.id, { title: v })}
            placeholder="無題"
            fw={700}
          />
        </Card.Section>
        <Stack mt="md" gap="xs">
          {visibleColumns.slice(0, 4).map((c) => (
            <Group key={c.id} justify="space-between" gap="xs">
              <Group gap="xs" wrap="nowrap" style={{ flex: '0 0 auto' }}>
                {getIconForType(c.type)}
                <Text size="xs" c="dimmed">{c.name}</Text>
              </Group>
              <Box style={{ flex: 1, maxWidth: 120 }}>
                <PropertyCell rowPage={row} col={c} columns={columns} workspace={workspace} updateCell={updateCell} variant="filled" readOnly />
              </Box>
            </Group>
          ))}
        </Stack>
        <Group justify="end" mt="md">
          <ActionIcon color="red" variant="subtle" size="sm" onClick={() => deletePage(row.id)}><IconTrash size={14}/></ActionIcon>
        </Group>
      </Card>
    ))}
    <Card withBorder style={{ borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 150 }} onClick={() => addPage(pageId)}>
       <Stack align="center" gap="xs">
         <IconPlus size={24} color="gray" />
         <Text c="dimmed" size="sm">新規アイテム</Text>
       </Stack>
    </Card>
  </Box>
);

const DatabaseCalendarView = ({ rows, columns, currentView, updateCurrentView, addPage, pageId }: {
  rows: DatabasePageLike[];
  columns: DatabaseColumn[];
  currentView: DatabaseView;
  updateCurrentView: (updates: Partial<DatabaseView>) => void;
  addPage: AddPageFn;
  pageId: string;
}) => {
  const dateColId = currentView.calendarDateColumnId || columns.find((c) => c.type === 'date')?.id || "date";
  const [viewMonth, setViewMonth] = useState(new Date());

  const startDate = dayjs(viewMonth).startOf('month').startOf('week');
  const endDate = dayjs(viewMonth).endOf('month').endOf('week');
  
  const days = [];
  let curr = startDate;
  while (curr.isBefore(endDate) || curr.isSame(endDate, 'day')) {
    days.push(curr);
    curr = curr.add(1, 'day');
  }

  return (
    <Paper withBorder radius="md">
      <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
         <Group>
           <Text fw={700} size="lg">{dayjs(viewMonth).format("YYYY年 MM月")}</Text>
           <MantineSelect size="xs" placeholder="日付項目を選択" data={columns.filter((c) => c.type === 'date').map((c) => ({ label: c.name, value: c.id }))} value={dateColId} onChange={v => v && updateCurrentView({ calendarDateColumnId: v })} />
         </Group>
         <Group gap={4}>
           <ActionIcon variant="subtle" color="gray" onClick={() => setViewMonth(dayjs(viewMonth).subtract(1, 'month').toDate())}><IconChevronLeft size={16}/></ActionIcon>
           <Button variant="subtle" size="xs" color="gray" onClick={() => setViewMonth(new Date())}>今日</Button>
           <ActionIcon variant="subtle" color="gray" onClick={() => setViewMonth(dayjs(viewMonth).add(1, 'month').toDate())}><IconChevronRight size={16}/></ActionIcon>
         </Group>
      </Group>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--mantine-color-gray-1)' }}>
         {['日', '月', '火', '水', '木', '金', '土'].map(d => (
           <Box key={d} p="xs" style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
             <Text size="xs" ta="center" fw={700} c="dimmed">{d}</Text>
           </Box>
         ))}
      </Box>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 600 }}>
        {days.map((d, i) => {
          const isToday = d.isSame(dayjs(), 'day');
          const isSameMonth = d.isSame(dayjs(viewMonth), 'month');
          const dayRows = rows.filter((r) => d.isSame(dayjs(r.properties?.[dateColId]), 'day'));
          return (
            <Box key={i} p="xs" style={{ borderRight: '1px solid var(--mantine-color-gray-2)', borderBottom: '1px solid var(--mantine-color-gray-2)', backgroundColor: isSameMonth ? 'transparent' : 'var(--mantine-color-gray-0)' }}>
               <Group justify="end" mb={4}>
                  <Text size="xs" fw={isToday ? 800 : 400} c={isToday ? 'blue' : (isSameMonth ? 'inherit' : 'gray.5')} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: isToday ? 'var(--mantine-color-blue-1)' : 'transparent' }}>{d.date()}</Text>
               </Group>
               <Stack gap={4}>
                 {dayRows.map((r) => (
                   <Tooltip key={r.id} label={r.title}>
                     <Box p={4} style={{ backgroundColor: 'var(--mantine-color-blue-0)', border: '1px solid var(--mantine-color-blue-2)', borderRadius: 4, cursor: 'pointer' }}>
                       <Text size="xs" truncate fw={500}>{r.title}</Text>
                     </Box>
                   </Tooltip>
                 ))}
                 <ActionIcon variant="transparent" size="xs" color="gray" onClick={() => addPage(pageId, { [dateColId]: d.format("YYYY-MM-DD") })}><IconPlus size={10}/></ActionIcon>
               </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

const DatabaseTimelineView = ({ rows, columns, currentView, updateCurrentView, updatePage }: {
  rows: DatabasePageLike[];
  columns: DatabaseColumn[];
  currentView: DatabaseView;
  updateCurrentView: (updates: Partial<DatabaseView>) => void;
  updatePage: UpdatePageFn;
}) => {
  const startColId = currentView.timelineStartColumnId || columns.find((c) => c.type === 'date')?.id || "start_date";
  const endColId = currentView.timelineEndColumnId || columns.find((c) => c.type === 'date' && c.id !== startColId)?.id || "end_date";
  
  const [viewDate, setViewDate] = useState(new Date());
  const daysToShow = 30;
  const startDate = dayjs(viewDate).subtract(10, 'day');
  
  const timelineDays = Array.from({ length: daysToShow }).map((_, i) => startDate.add(i, 'day'));

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Group>
          <Text fw={700} size="lg">{dayjs(viewDate).format("YYYY年 MM月")}</Text>
          <Group gap="xs">
            <MantineSelect size="xs" placeholder="開始日" data={columns.filter((c) => c.type === 'date').map((c) => ({ label: c.name, value: c.id }))} value={startColId} onChange={v => v && updateCurrentView({ timelineStartColumnId: v })} />
            <MantineSelect size="xs" placeholder="終了日" data={columns.filter((c) => c.type === 'date').map((c) => ({ label: c.name, value: c.id }))} value={endColId} onChange={v => v && updateCurrentView({ timelineEndColumnId: v })} />
          </Group>
        </Group>
        <Group gap={4}>
          <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate(dayjs(viewDate).subtract(1, 'month').toDate())}><IconChevronLeft size={16}/></ActionIcon>
          <Button variant="subtle" size="xs" color="gray" onClick={() => setViewDate(new Date())}>今日</Button>
          <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate(dayjs(viewDate).add(1, 'month').toDate())}><IconChevronRight size={16}/></ActionIcon>
        </Group>
      </Group>

      <Box style={{ overflowX: 'auto' }}>
        <Box style={{ minWidth: 1200 }}>
          {/* Timeline Header */}
          <Box style={{ display: 'flex', backgroundColor: 'var(--mantine-color-gray-1)', borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Box style={{ width: 200, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid var(--mantine-color-gray-3)' }}>
              <Text size="xs" fw={700} c="dimmed">アイテム</Text>
            </Box>
            {timelineDays.map(d => (
              <Box key={d.format('YYYY-MM-DD')} style={{ flex: 1, padding: '8px 4px', borderRight: '1px solid var(--mantine-color-gray-2)', textAlign: 'center', minWidth: 40, backgroundColor: d.isSame(dayjs(), 'day') ? 'var(--mantine-color-blue-0)' : 'transparent' }}>
                <Text size="xs" fw={700} c={d.day() === 0 ? 'red' : d.day() === 6 ? 'blue' : 'dimmed'}>{d.date()}</Text>
                <Text style={{ fontSize: 9 }} c="dimmed">{(['日','月','火','水','木','金','土'])[d.day()]}</Text>
              </Box>
            ))}
          </Box>

          {/* Timeline Body */}
          <Stack gap={0}>
            {rows.map((row) => {
              const start = row.properties?.[startColId] ? dayjs(row.properties?.[startColId]) : null;
              const end = row.properties?.[endColId] ? dayjs(row.properties?.[endColId]) : start;
              
              const startOffset = start ? start.diff(startDate, 'day') : -1;
              const duration = (start && end) ? end.diff(start, 'day') + 1 : 1;
              
              return (
                <Box key={row.id} style={{ display: 'flex', borderBottom: '1px solid var(--mantine-color-gray-1)', height: 40 }}>
                  <Box style={{ width: 200, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid var(--mantine-color-gray-3)', display: 'flex', alignItems: 'center' }}>
                    <DebouncedInput
                      variant="unstyled"
                      size="xs"
                      value={row.title}
                      onChange={(v) => updatePage(row.id, { title: v })}
                      placeholder="無題"
                      style={{ width: '100%' }}
                    />
                  </Box>
                  <Box style={{ flex: 1, position: 'relative', display: 'flex' }}>
                    {timelineDays.map(d => (
                       <Box key={d.format('YYYY-MM-DD')} style={{ flex: 1, borderRight: '1px solid var(--mantine-color-gray-1)', minWidth: 40 }} />
                    ))}
                    
                    {start && startOffset >= -duration && startOffset < daysToShow && (
                      <Box 
                        style={{ 
                          position: 'absolute', 
                          left: `${(startOffset / daysToShow) * 100}%`, 
                          width: `${(duration / daysToShow) * 100}%`,
                          top: 8,
                          height: 24,
                          backgroundColor: 'var(--mantine-color-blue-5)',
                          borderRadius: 4,
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          zIndex: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        {row.title}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
};

interface FullPageDatabaseProps {
  page: DatabasePageLike;
  workspace: WorkspaceLike;
  updatePage: UpdatePageFn;
  addPage: AddPageFn;
  deletePage: DeletePageFn;
}

// --- Main Component ---

export const FullPageDatabase: React.FC<FullPageDatabaseProps> = ({ page, workspace, updatePage, addPage, deletePage }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const columns: DatabaseColumn[] = useMemo(() => {
    const rawColumns = page.databaseColumns || [];
    return rawColumns.map((col) => {
      if (typeof col === "string") {
        return { id: col, name: col, type: "text" } as DatabaseColumn;
      }
      return col as DatabaseColumn;
    });
  }, [page.databaseColumns]);

  const views: DatabaseView[] = page.databaseViews || [{ id: "view1", name: "テーブル", type: "table", filters: [], sorts: [] }];
  const currentViewId = page.currentViewId || views[0]?.id;
  const currentView = views.find(v => v.id === currentViewId) || views[0];

  const rawRows = (page.childrenIds || []).map((id: string) => workspace.pages[id]).filter((p): p is DatabasePageLike => Boolean(p && !p.isTrashed));

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rawRows];
    if (currentView.filters && currentView.filters.length > 0) {
      result = result.filter(row => {
        return currentView.filters.every(f => {
          let val = f.columnId === "title" ? row.title : (row.properties?.[f.columnId] || "");
          const col = columns.find(c => c.id === f.columnId);
          if (col?.type === 'formula') val = calculateFormula(row, col, columns);
          switch (f.operator) {
            case "contains": return String(val).toLowerCase().includes(f.value.toLowerCase());
            case "not_contains": return !String(val).toLowerCase().includes(f.value.toLowerCase());
            case "equals": return String(val) === f.value;
            case "not_equals": return String(val) !== f.value;
            case "is_empty": return !val || val === "[]";
            case "is_not_empty": return !!val && val !== "[]";
            case "greater_than": return Number(val) > Number(f.value);
            case "less_than": return Number(val) < Number(f.value);
            default: return true;
          }
        });
      });
    }
    if (currentView.sorts && currentView.sorts.length > 0) {
      result.sort((a, b) => {
        for (const s of currentView.sorts) {
          let valA = s.columnId === "title" ? a.title : (a.properties?.[s.columnId] || "");
          let valB = s.columnId === "title" ? b.title : (b.properties?.[s.columnId] || "");
          const col = columns.find(c => c.id === s.columnId);
          if (col?.type === 'formula') { valA = calculateFormula(a, col, columns); valB = calculateFormula(b, col, columns); }
          if (valA === valB) continue;
          const direction = s.direction === "asc" ? 1 : -1;
          const numA = Number(valA); const numB = Number(valB);
          if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * direction;
          if (valA < valB) return -1 * direction;
          if (valA > valB) return 1 * direction;
        }
        return 0;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => {
        const inTitle = row.title.toLowerCase().includes(q);
        const inProps = Object.keys(row.properties || {}).some(colId => {
          const col = columns.find(c => c.id === colId);
          let val = row.properties?.[colId] || "";
          if (col?.type === 'formula') val = calculateFormula(row, col, columns);
          return String(val).toLowerCase().includes(q);
        });
        return inTitle || inProps;
      });
    }

    return result;
  }, [rawRows, currentView, columns, searchQuery]);

  const updateColumns = (newCols: DatabaseColumn[]) => updatePage(page.id, { databaseColumns: newCols });
  const updateColumn = (index: number, updates: Partial<DatabaseColumn>) => {
    const newCols = [...columns];
    newCols[index] = { ...newCols[index], ...updates };
    updateColumns(newCols);
  };
  const addColumn = () => updateColumns([...columns, { id: Date.now().toString(), name: `列${columns.length + 1}`, type: "text" }]);
  const removeColumn = (index: number) => {
    const newCols = [...columns]; newCols.splice(index, 1); updateColumns(newCols);
  };
  const updateCell = (rowPageId: string, colId: string, value: string | boolean) => {
    const rowPage = workspace.pages[rowPageId]; if (!rowPage) return;
    updatePage(rowPageId, { properties: { ...rowPage.properties, [colId]: String(value) } });
  };
  const updateViews = (newViews: DatabaseView[]) => updatePage(page.id, { databaseViews: newViews });
  const updateCurrentView = (updates: Partial<DatabaseView>) => {
    const newViews = views.map(v => v.id === currentViewId ? { ...v, ...updates } : v); updateViews(newViews);
  };
  const addView = (type: DatabaseViewType) => {
    const id = Date.now().toString();
    const names = { table: "テーブル", list: "リスト", kanban: "カンバン", gallery: "ギャラリー", calendar: "カレンダー", timeline: "タイムライン" };
    updatePage(page.id, { databaseViews: [...views, { id, name: names[type], type, filters: [], sorts: [] }], currentViewId: id });
  };
  const deleteView = (id: string) => {
    if (views.length <= 1) return;
    const newViews = views.filter(v => v.id !== id); updatePage(page.id, { databaseViews: newViews, currentViewId: newViews[0].id });
  };

  const visibleColumns = useMemo(() => {
    if (!currentView.visibleColumnIds) return columns;
    return columns.filter(c => currentView.visibleColumnIds?.includes(c.id));
  }, [columns, currentView.visibleColumnIds]);

  return (
    <Box p="xl" style={{ maxWidth: '1200px', margin: '0 auto', flex: 1, paddingBottom: 100 }}>
      {/* Title */}
      <DebouncedInput
        variant="transparent" size="xl" fw={800} value={page.title}
        onChange={(v) => updatePage(page.id, { title: v })}
        placeholder="Database Title" style={{ fontSize: "2.5rem", marginBottom: "1.5rem", width: "100%" }}
      />

      {/* Control Bar */}
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Tabs value={currentViewId} onChange={v => v && updatePage(page.id, { currentViewId: v })} styles={{ tab: { paddingRight: 4 } }}>
            <Tabs.List>
              {views.map(v => (
                <Tabs.Tab 
                  key={v.id} value={v.id}
                  leftSection={
                    v.type === 'table' ? <IconTable size={14}/> :
                    v.type === 'list' ? <IconLayoutList size={14}/> :
                    v.type === 'kanban' ? <IconLayoutKanban size={14}/> :
                    v.type === 'calendar' ? <IconCalendar size={14}/> :
                    v.type === 'timeline' ? <IconTimeline size={14}/> :
                    <IconPhoto size={14}/>
                  }
                  rightSection={
                    <Menu shadow="md" position="bottom-end">
                      <Menu.Target><ActionIcon variant="transparent" color="gray" size="xs" onClick={(e) => e.stopPropagation()}><IconChevronDown size={10} /></ActionIcon></Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>ビューの設定</Menu.Label>
                        <Box p="xs"><DebouncedInput size="xs" value={v.name} onChange={(newName) => updateViews(views.map(view => view.id === v.id ? { ...view, name: newName } : view))} /></Box>
                        <Menu.Divider /><Menu.Item color="red" leftSection={<IconTrash size={14}/>} onClick={() => deleteView(v.id)}>削除</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  }
                >{v.name}</Tabs.Tab>
              ))}
              <Menu shadow="md" width={150}>
                <Menu.Target><ActionIcon variant="subtle" color="gray" size="md" mb="xs"><IconPlus size={16}/></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconTable size={14}/>} onClick={() => addView("table")}>テーブル</Menu.Item>
                  <Menu.Item leftSection={<IconLayoutList size={14}/>} onClick={() => addView("list")}>リスト</Menu.Item>
                  <Menu.Item leftSection={<IconLayoutKanban size={14}/>} onClick={() => addView("kanban")}>カンバン</Menu.Item>
                  <Menu.Item leftSection={<IconCalendar size={14}/>} onClick={() => addView("calendar")}>カレンダー</Menu.Item>
                  <Menu.Item leftSection={<IconPhoto size={14}/>} onClick={() => addView("gallery")}>ギャラリー</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Tabs.List>
          </Tabs>
        </Group>

        <Group gap="xs">
          <DebouncedInput 
            size="xs"
            leftSection={<IconSearch size={14}/>}
            placeholder="検索..."
            value={searchQuery}
            onChange={setSearchQuery}
            style={{ width: 180 }}
          />
          <Menu shadow="md" width={200} closeOnItemClick={false}>
             <Menu.Target><Button variant="subtle" color="gray" size="xs" leftSection={<IconEye size={14}/>}>表示項目</Button></Menu.Target>
             <Menu.Dropdown p="sm">
                <Text fw={700} size="xs" mb="xs">表示・非表示</Text>
                <Stack gap={4}>
                   {columns.map(col => {
                      const isVisible = !currentView.visibleColumnIds || currentView.visibleColumnIds.includes(col.id);
                      return (
                         <Group key={col.id} justify="space-between" gap="xs">
                            <Group gap="xs">{getIconForType(col.type)}<Text size="xs">{col.name}</Text></Group>
                            <ActionIcon variant="subtle" color={isVisible ? "blue" : "gray"} size="xs" onClick={() => {
                                  const currentIds = currentView.visibleColumnIds || columns.map(c => c.id);
                                  updateCurrentView({ visibleColumnIds: isVisible ? currentIds.filter(id => id !== col.id) : [...currentIds, col.id] });
                               }}
                            >{isVisible ? <IconEye size={12}/> : <IconEyeOff size={12}/>}</ActionIcon>
                         </Group>
                      );
                   })}
                </Stack>
             </Menu.Dropdown>
          </Menu>

          <Menu shadow="md" width={320} closeOnItemClick={false}>
            <Menu.Target><Button variant="subtle" color="gray" size="xs" leftSection={<IconFilter size={14}/>}>フィルター {currentView.filters?.length > 0 && <Badge size="xs" ml={4}>{currentView.filters.length}</Badge>}</Button></Menu.Target>
            <Menu.Dropdown p="sm">
              <Text fw={700} size="xs" mb="xs">フィルター設定</Text>
              <Stack gap="xs">
                {(currentView.filters || []).map((f, i) => (
                  <Group key={f.id} gap="xs" wrap="nowrap">
                    <MantineSelect size="xs" style={{ width: 100 }} data={[{ id: "title", name: "タイトル" }, ...columns].map(c => ({ label: c.name, value: c.id }))} value={f.columnId} onChange={v => updateCurrentView({ filters: currentView.filters.map((filter, idx) => idx === i ? { ...filter, columnId: v || "title" } : filter) })} />
                    <MantineSelect size="xs" style={{ width: 100 }} data={[{ label: "含む", value: "contains" }, { label: "含まない", value: "not_contains" }, { label: "等しい", value: "equals" }, { label: "等しくない", value: "not_equals" }, { label: "> より大", value: "greater_than" }, { label: "< より小", value: "less_than" },{ label: "空", value: "is_empty" }, { label: "非空", value: "is_not_empty" }]} value={f.operator} onChange={v => updateCurrentView({ filters: currentView.filters.map((filter, idx) => idx === i ? { ...filter, operator: v as DatabaseFilterOperator } : filter) })} />
                    <DebouncedInput size="xs" style={{ flex: 1 }} value={f.value} onChange={v => updateCurrentView({ filters: currentView.filters.map((filter, idx) => idx === i ? { ...filter, value: v } : filter) })} />
                    <ActionIcon color="red" variant="subtle" size="xs" onClick={() => updateCurrentView({ filters: currentView.filters.filter((_, idx) => idx !== i) })}><IconTrash size={12}/></ActionIcon>
                  </Group>
                ))}
                <Button variant="light" size="xs" leftSection={<IconPlus size={14}/>} onClick={() => updateCurrentView({ filters: [...(currentView.filters || []), { id: Date.now().toString(), columnId: "title", operator: "contains", value: "" }] })}>追加</Button>
              </Stack>
            </Menu.Dropdown>
          </Menu>

          <Menu shadow="md" width={250} closeOnItemClick={false}>
            <Menu.Target><Button variant="subtle" color="gray" size="xs" leftSection={<IconSortAscending size={14}/>}>ソート {currentView.sorts?.length > 0 && <Badge size="xs" ml={4}>{currentView.sorts.length}</Badge>}</Button></Menu.Target>
            <Menu.Dropdown p="sm">
              <Text fw={700} size="xs" mb="xs">ソート設定</Text>
              <Stack gap="xs">
                {(currentView.sorts || []).map((s, i) => (
                  <Group key={s.id} gap="xs" wrap="nowrap">
                    <MantineSelect size="xs" style={{ flex: 1 }} data={[{ id: "title", name: "タイトル" }, ...columns].map(c => ({ label: c.name, value: c.id }))} value={s.columnId} onChange={v => updateCurrentView({ sorts: currentView.sorts.map((sort, idx) => idx === i ? { ...sort, columnId: v || "title" } : sort) })} />
                    <MantineSelect size="xs" style={{ width: 80 }} data={[{ label: "昇順", value: "asc" }, { label: "降順", value: "desc" }]} value={s.direction} onChange={v => updateCurrentView({ sorts: currentView.sorts.map((sort, idx) => idx === i ? { ...sort, direction: v as "asc" | "desc" } : sort) })} />
                    <ActionIcon color="red" variant="subtle" size="xs" onClick={() => updateCurrentView({ sorts: currentView.sorts.filter((_, idx) => idx !== i) })}><IconTrash size={12}/></ActionIcon>
                  </Group>
                ))}
                <Button variant="light" size="xs" leftSection={<IconPlus size={14}/>} onClick={() => updateCurrentView({ sorts: [...(currentView.sorts || []), { id: Date.now().toString(), columnId: "title", direction: "asc" }] })}>追加</Button>
              </Stack>
            </Menu.Dropdown>
          </Menu>

          {currentView.type === 'kanban' && (
            <Menu shadow="md" width={200}>
              <Menu.Target><Button variant="outline" color="gray" size="xs" leftSection={<IconSettings size={14}/>}>グループ化: {columns.find(c => c.id === currentView.groupByColumnId)?.name || '未設定'}</Button></Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>グループ化</Menu.Label>
                {columns.filter(c => ['select', 'multi-select', 'checkbox', 'text'].includes(c.type)).map(col => (
                  <Menu.Item key={col.id} onClick={() => updateCurrentView({ groupByColumnId: col.id })}>{col.name}</Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {/* Render View */}
      <Box mt="xl">
        {currentView.type === 'table' && <DatabaseTableView columns={columns} visibleColumns={visibleColumns} rows={filteredAndSortedRows} workspace={workspace} updatePage={updatePage} deletePage={deletePage} addPage={addPage} updateColumn={updateColumn} addColumn={addColumn} removeColumn={removeColumn} updateCell={updateCell} pageId={page.id} />}
        {currentView.type === 'list' && <DatabaseListView rows={filteredAndSortedRows} visibleColumns={visibleColumns} columns={columns} updatePage={updatePage} deletePage={deletePage} addPage={addPage} pageId={page.id} />}
        {currentView.type === 'kanban' && <DatabaseKanbanView rows={filteredAndSortedRows} visibleColumns={visibleColumns} columns={columns} currentView={currentView} updateCurrentView={updateCurrentView} updatePage={updatePage} addPage={addPage} pageId={page.id} updateCell={updateCell} />}
        {currentView.type === 'gallery' && <DatabaseGalleryView rows={filteredAndSortedRows} visibleColumns={visibleColumns} columns={columns} workspace={workspace} updatePage={updatePage} deletePage={deletePage} addPage={addPage} updateCell={updateCell} pageId={page.id} />}
        {currentView.type === 'calendar' && <DatabaseCalendarView rows={filteredAndSortedRows} columns={columns} currentView={currentView} updateCurrentView={updateCurrentView} addPage={addPage} pageId={page.id} />}
        {currentView.type === 'timeline' && <DatabaseTimelineView rows={filteredAndSortedRows} columns={columns} currentView={currentView} updateCurrentView={updateCurrentView} updatePage={updatePage} />}
      </Box>
    </Box>
  );
};
