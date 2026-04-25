import React from "react";
import { Box, Group, Text, ActionIcon, Button, Paper, Menu, Checkbox, Select as MantineSelect, NumberInput } from "@mantine/core";
import { IconPlus, IconTrash, IconAbc, IconNumbers, IconChevronDown, IconCalendar, IconCircleCheck, IconList } from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import { DebouncedInput } from "./DebouncedInput";
import type { DatabaseColumn, DatabaseColumnType } from "../App";
import dayjs from "dayjs";

interface FullPageDatabaseProps {
  page: any;
  workspace: any;
  updatePage: (pageId: string, updates: any) => void;
  addPage: (parentId: string | null) => void;
  deletePage: (pageId: string) => void;
}

export const FullPageDatabase: React.FC<FullPageDatabaseProps> = ({ page, workspace, updatePage, addPage, deletePage }) => {
  // Normalize columns: convert strings to DatabaseColumn objects
  const rawColumns = page.databaseColumns || [];
  const columns = rawColumns.map((col: any) => {
    if (typeof col === "string") {
      return { id: col, name: col, type: "text" } as DatabaseColumn;
    }
    return col as DatabaseColumn;
  });

  const rows = (page.childrenIds || []).map((id: string) => workspace.pages[id]).filter(Boolean);

  const updateColumns = (newCols: DatabaseColumn[]) => {
    updatePage(page.id, { databaseColumns: newCols });
  };

  const updateColumn = (index: number, updates: Partial<DatabaseColumn>) => {
    const newCols = [...columns];
    newCols[index] = { ...newCols[index], ...updates };
    updateColumns(newCols);
  };

  const addColumn = () => {
    const id = Date.now().toString();
    updateColumns([...columns, { id, name: `列${columns.length + 1}`, type: "text" }]);
  };

  const removeColumn = (index: number) => {
    const newCols = [...columns];
    newCols.splice(index, 1);
    updateColumns(newCols);
  };

  const updateCell = (rowPageId: string, colId: string, value: any) => {
    const rowPage = workspace.pages[rowPageId];
    if (!rowPage) return;
    updatePage(rowPageId, { properties: { ...rowPage.properties, [colId]: String(value) } });
  };

  const getIconForType = (type: DatabaseColumnType) => {
    switch (type) {
      case "number": return <IconNumbers size={14} />;
      case "checkbox": return <IconCircleCheck size={14} />;
      case "date": return <IconCalendar size={14} />;
      case "select": return <IconList size={14} />;
      default: return <IconAbc size={14} />;
    }
  };

  const PropertyCell = ({ rowPage, col }: { rowPage: any, col: DatabaseColumn }) => {
    const value = rowPage.properties?.[col.id] || "";

    switch (col.type) {
      case "checkbox":
        return (
          <Box style={{ padding: "8px 12px", display: 'flex', alignItems: 'center', height: '100%' }}>
            <Checkbox 
              checked={value === "true"} 
              onChange={(e) => updateCell(rowPage.id, col.id, e.currentTarget.checked)}
            />
          </Box>
        );
      case "number":
        return (
          <NumberInput
            variant="unstyled"
            value={value ? Number(value) : undefined}
            onChange={(v) => updateCell(rowPage.id, col.id, v)}
            placeholder="..."
            styles={{ input: { padding: "8px 12px" } }}
          />
        );
      case "date":
         return (
           <DatePickerInput
             variant="unstyled"
             value={value ? dayjs(value).toDate() : null}
             onChange={(d) => updateCell(rowPage.id, col.id, d ? dayjs(d).format("YYYY-MM-DD") : "")}
             placeholder="..."
             styles={{ input: { padding: "8px 12px" } }}
           />
         );
      case "select":
        return (
          <MantineSelect
            variant="unstyled"
            data={col.options || []}
            value={value}
            onChange={(v) => {
              if (v) updateCell(rowPage.id, col.id, v);
            }}
            placeholder="..."
            searchable
            styles={{ input: { padding: "8px 12px" } }}
          />
        );
      default:
        return (
          <DebouncedInput
            variant="unstyled"
            value={value}
            onChange={(v) => updateCell(rowPage.id, col.id, v)}
            placeholder="..."
            styles={{ input: { padding: "8px 12px" } }}
          />
        );
    }
  };

  return (
    <Box p="xl" style={{ maxWidth: '1200px', margin: '0 auto', flex: 1, paddingBottom: 100 }}>
      <DebouncedInput
        variant="transparent"
        size="xl"
        fw={800}
        value={page.title}
        onChange={(v) => updatePage(page.id, { title: v })}
        placeholder="Database Title"
        style={{ fontSize: "2rem", marginBottom: "2rem", width: "100%" }}
      />
      
      <Paper shadow="sm" radius="md" withBorder style={{ overflowX: "auto", overflowY: "hidden", minHeight: 150 }}>
        <Box style={{ display: 'grid', gridTemplateColumns: `minmax(200px, 1fr) repeat(${columns.length}, minmax(150px, 1fr)) 50px` }}>
          {/* Header */}
          <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "10px 16px", backgroundColor: "var(--mantine-color-gray-0)" }}>
            <Text fw={600} size="sm" c="dimmed">タイトル</Text>
          </Box>
          {columns.map((col: DatabaseColumn, i: number) => (
             <Box key={col.id} style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "4px 8px", backgroundColor: "var(--mantine-color-gray-0)" }}>
               <Group wrap="nowrap" gap="xs" justify="space-between">
                 <Menu shadow="md" width={200} position="bottom-start">
                   <Menu.Target>
                     <Group wrap="nowrap" gap="xs" style={{ cursor: 'pointer', flex: 1 }}>
                       {getIconForType(col.type)}
                       <Text size="xs" fw={600} c="dimmed" truncate>{col.name}</Text>
                       <IconChevronDown size={12} color="var(--mantine-color-gray-5)" />
                     </Group>
                   </Menu.Target>
                   <Menu.Dropdown>
                     <Menu.Label>プロパティ名</Menu.Label>
                     <Box p="xs">
                       <DebouncedInput 
                         size="xs" 
                         value={col.name} 
                         onChange={(v) => updateColumn(i, { name: v })}
                       />
                     </Box>
                     {col.type === "select" && (
                       <>
                         <Menu.Label>選択肢の管理 (カンマ区切り)</Menu.Label>
                         <Box p="xs">
                           <DebouncedInput 
                             size="xs" 
                             placeholder="例: 未着手, 進行中, 完了"
                             value={col.options?.join(", ") || ""} 
                             onChange={(v) => updateColumn(i, { options: v.split(",").map(s => s.trim()).filter(Boolean) })}
                           />
                         </Box>
                       </>
                     )}
                     <Menu.Divider />
                     <Menu.Label>種類</Menu.Label>
                     <Menu.Item leftSection={<IconAbc size={14}/>} onClick={() => updateColumn(i, { type: "text" })}>テキスト</Menu.Item>
                     <Menu.Item leftSection={<IconNumbers size={14}/>} onClick={() => updateColumn(i, { type: "number" })}>数値</Menu.Item>
                     <Menu.Item leftSection={<IconList size={14}/>} onClick={() => updateColumn(i, { type: "select" })}>セレクト</Menu.Item>
                     <Menu.Item leftSection={<IconCircleCheck size={14}/>} onClick={() => updateColumn(i, { type: "checkbox" })}>チェックボックス</Menu.Item>
                     <Menu.Item leftSection={<IconCalendar size={14}/>} onClick={() => updateColumn(i, { type: "date" })}>日付</Menu.Item>
                     <Menu.Divider />
                     <Menu.Item color="red" leftSection={<IconTrash size={14}/>} onClick={() => removeColumn(i)}>削除</Menu.Item>
                   </Menu.Dropdown>
                 </Menu>
               </Group>
             </Box>
          ))}
          <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", backgroundColor: "var(--mantine-color-gray-0)", padding: "8px 12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <ActionIcon onClick={addColumn} variant="subtle" color="gray"><IconPlus size={16}/></ActionIcon>
          </Box>

          {/* Rows */}
          {rows.map((rowPage: any) => (
            <React.Fragment key={rowPage.id}>
              {/* Row Title */}
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
              {/* Row Cells */}
              {columns.map((col: DatabaseColumn) => (
                <Box key={col.id} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", borderRight: "1px solid var(--mantine-color-gray-2)" }}>
                   <PropertyCell rowPage={rowPage} col={col} />
                </Box>
              ))}
              {/* Row Delete */}
              <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", padding: "8px", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <ActionIcon color="red" variant="subtle" onClick={() => deletePage(rowPage.id)}><IconTrash size={16}/></ActionIcon>
              </Box>
            </React.Fragment>
          ))}
        </Box>
        <Box p="md" style={{ backgroundColor: rows.length === 0 ? "var(--mantine-color-gray-0)" : "transparent" }}>
          <Button variant="subtle" size="sm" color="gray" leftSection={<IconPlus size={16}/>} onClick={() => addPage(page.id)}>新規追加</Button>
        </Box>
      </Paper>
    </Box>
  );
};
