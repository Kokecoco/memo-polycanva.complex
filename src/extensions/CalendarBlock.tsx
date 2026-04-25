import { createReactBlockSpec } from "@blocknote/react";
import { Paper, Box, Group, Text, ActionIcon, Stack, Button } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconTrash } from "@tabler/icons-react";
import { DebouncedInput } from "./DebouncedInput";
import { useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import "./CustomBlocks.css";

const CalendarBlockComponent = (props: any) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (props.block.props.selectedDate) {
      const date = new Date(props.block.props.selectedDate);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
        setViewDate(date);
      }
    } else {
      setSelectedDate(null);
    }

    try {
      const parsedEvents = JSON.parse(props.block.props.events);
      setEvents(parsedEvents && typeof parsedEvents === "object" ? parsedEvents : {});
    } catch {
      setEvents({});
    }
  }, [props.block.props.selectedDate, props.block.props.events]);

  const updateProps = useCallback(
    (newDate: any, newEvents: Record<string, string | string[]>, newTitle: string) => {
      let isoStr = "";
      if (newDate) {
        const d = dayjs(newDate);
        if (d.isValid()) isoStr = d.toISOString();
      }
      props.editor.updateBlock(props.block, {
        type: "calendar",
        props: {
          selectedDate: isoStr,
          events: JSON.stringify(newEvents),
          title: newTitle,
        },
      });
    },
    [props.editor, props.block]
  );

  const handleDateChange = (date: any) => {
    updateProps(date, events, props.block.props.title);
  };

  const updateEventList = (dateStr: string, evs: string[]) => {
    const newEvents = { ...events };
    // Remove empty strings if they are the only ones, but keep empty strings if user is typing
    const isEmpty = evs.filter((e) => e.trim() !== "").length === 0;
    if (isEmpty) {
      delete newEvents[dateStr];
    } else {
      newEvents[dateStr] = evs;
    }
    updateProps(selectedDate, newEvents, props.block.props.title);
  };

  const dateStr = selectedDate ? dayjs(selectedDate).format("YYYY-MM-DD") : "";

  const startOfMonth = dayjs(viewDate).startOf("month");
  const endOfMonth = dayjs(viewDate).endOf("month");
  const startDate = startOfMonth.startOf("week"); // Sunday
  const endDate = endOfMonth.endOf("week");

  const calendarDays: dayjs.Dayjs[] = [];
  let currDate = startDate;
  while (currDate.isBefore(endDate) || currDate.isSame(endDate, "day")) {
    calendarDays.push(currDate);
    currDate = currDate.add(1, "day");
  }

  return (
    <Paper className="custom-block-wrapper" shadow="xs" radius="md" p="md" withBorder style={{ width: "100%", margin: "12px 0", backgroundColor: "var(--mantine-color-body)" }}>
      <Group mb="md">
        <DebouncedInput
          variant="transparent"
          size="lg"
          fw={700}
          value={props.block.props.title}
          onChange={(v) => updateProps(selectedDate, events, v)}
          placeholder="Calendar Title"
          style={{ flex: 1 }}
        />
      </Group>
      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Box style={{ flex: "0 0 auto", borderRight: "1px solid var(--mantine-color-gray-2)", paddingRight: "var(--mantine-spacing-xl)", width: 300 }}>
          <Group justify="space-between" mb="sm">
            <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate(dayjs(viewDate).subtract(1, 'month').toDate())}><IconChevronLeft size={16} /></ActionIcon>
            <Text fw={600} size="sm">{dayjs(viewDate).format("YYYY年 MM月")}</Text>
            <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate(dayjs(viewDate).add(1, 'month').toDate())}><IconChevronRight size={16} /></ActionIcon>
          </Group>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 8 }}>
             {["日", "月", "火", "水", "木", "金", "土"].map(d => <Text key={d} size="xs" c="dimmed" fw={600}>{d}</Text>)}
          </Box>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
             {calendarDays.map((d, i) => {
                const isCurrentMonth = d.month() === dayjs(viewDate).month();
                const isSelected = selectedDate && d.isSame(selectedDate, "day");
                const hasEvent = !!events[d.format("YYYY-MM-DD")];
                return (
                   <Box 
                      key={i} 
                      onClick={() => handleDateChange(d.toDate())}
                      style={{ padding: '6px 0', textAlign: 'center', borderRadius: '4px', cursor: 'pointer', backgroundColor: isSelected ? 'var(--mantine-color-blue-filled)' : 'transparent', color: isSelected ? 'white' : (isCurrentMonth ? 'inherit' : 'var(--mantine-color-gray-4)') }}
                   >
                      <Text size="sm">{d.date()}</Text>
                      {hasEvent && <Box style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: isSelected ? 'white' : 'var(--mantine-color-blue-filled)', margin: '2px auto 0' }} />}
                   </Box>
                );
             })}
          </Box>
        </Box>
        <Box style={{ flex: 1, minWidth: 200, padding: "8px 0" }}>
          {selectedDate ? (
            <>
              <Text fw={600} size="lg" mb="sm" c="blue">
                {dayjs(selectedDate).format("YYYY年MM月DD日")}の予定
              </Text>
              <Stack gap="xs">
                {(() => {
                  let evs = events[dateStr] || [];
                  if (typeof evs === "string") evs = [evs];
                  if (evs.length === 0) evs = [""];
                  return evs.map((ev, i) => (
                    <Group key={i} wrap="nowrap">
                      <DebouncedInput
                        variant="filled"
                        size="md"
                        placeholder="予定を追加..."
                        style={{ flex: 1 }}
                        value={ev}
                        onChange={(v) => {
                          const newEvs = [...evs];
                          newEvs[i] = v;
                          updateEventList(dateStr, newEvs);
                        }}
                      />
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => {
                          const newEvs = [...evs];
                          newEvs.splice(i, 1);
                          updateEventList(dateStr, newEvs);
                        }}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  ));
                })()}
                <Button
                  variant="light"
                  size="sm"
                  mt="xs"
                  onClick={() => {
                    let evs = events[dateStr] || [];
                    if (typeof evs === "string") evs = [evs];
                    updateEventList(dateStr, [...evs, ""]);
                  }}
                >
                  + 予定を追加
                </Button>
              </Stack>
            </>
          ) : (
            <Text c="dimmed" fs="italic" mt="md" ta="center">
              日付を選択して予定を確認・追加します
            </Text>
          )}
        </Box>
      </Group>
    </Paper>
  );
};

export const CalendarBlock = createReactBlockSpec(
  {
    type: "calendar",
    propSchema: {
      selectedDate: {
        default: "",
      },
      events: {
        default: "{}", // JSON string of Record<string, string> (date string to event text)
      },
      title: {
        default: "Untitled Calendar",
      },
    },
    content: "none",
  },
  {
    render: CalendarBlockComponent,
  }
);
