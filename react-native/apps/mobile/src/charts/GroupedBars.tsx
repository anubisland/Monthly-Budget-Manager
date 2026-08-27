import React from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { groupedBarLayout, niceTicks } from './scale';

export interface GroupedBarsProps {
  groups: { label: string; values: number[] }[];
  seriesColors: string[];
  seriesLabels: string[];
  width: number;
  height?: number;
  formatValue?: (v: number) => string;
}

/**
 * A grouped bar chart -- two or more series per category, scaled against one
 * shared maximum. Every coordinate comes from groupedBarLayout/niceTicks,
 * which are tested; this component only maps them onto SVG elements.
 *
 * Group labels are never truncated. If they would collide, the caller is
 * responsible for showing fewer groups (comparisonView already limits to 8).
 */
export function GroupedBars({
  groups,
  seriesColors,
  seriesLabels,
  width,
  height = 200,
  formatValue,
}: GroupedBarsProps) {
  const axisWidth = 44;
  const labelHeight = 22;
  const legendHeight = 20;
  const plotWidth = Math.max(0, width - axisWidth);
  const plotHeight = Math.max(0, height - labelHeight - legendHeight);

  const allValues = groups.flatMap((g) => g.values);
  const ticks = niceTicks(Math.max(...allValues, 0));
  const axisMax = ticks[ticks.length - 1];
  // Scaled against the AXIS maximum, so the tallest bar meets the top
  // gridline rather than overshooting it.
  const groupRects = groupedBarLayout(
    groups.map((g) => g.values),
    { width: plotWidth, height: plotHeight, max: axisMax },
  );

  return (
    <View>
      <Svg width={width} height={legendHeight}>
        <G>
          {seriesLabels.map((label, i) => (
            <G key={`legend-${label}`}>
              <Rect x={i * 110} y={4} width={10} height={10} rx={2} fill={seriesColors[i]} />
              <SvgText x={i * 110 + 14} y={13} fontSize={11} fill="#141F1A">
                {label}
              </SvgText>
            </G>
          ))}
        </G>
      </Svg>

      <Svg width={width} height={height - legendHeight}>
        <G x={axisWidth}>
          {ticks.map((tick) => {
            const y = plotHeight - (axisMax > 0 ? (tick / axisMax) * plotHeight : 0);
            return (
              <G key={`t${tick}`}>
                <Line x1={0} y1={y} x2={plotWidth} y2={y} stroke="#D8DED8" strokeWidth={1} />
                <SvgText x={-6} y={y + 4} fontSize={10} fill="#5C6B63" textAnchor="end">
                  {formatValue ? formatValue(tick) : String(tick)}
                </SvgText>
              </G>
            );
          })}
          {groupRects.map((rects, gi) =>
            rects.map((b, si) => (
              <Rect
                key={`bar-${gi}-${si}`}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                rx={2}
                fill={seriesColors[si] ?? seriesColors[seriesColors.length - 1]}
              />
            )),
          )}
          {groupRects.map((rects, gi) => {
            const first = rects[0];
            const last = rects[rects.length - 1];
            if (!first || !last) return null;
            const center = (first.x + last.x + last.width) / 2;
            return (
              <SvgText
                key={`l${groups[gi].label}${gi}`}
                x={center}
                y={plotHeight + 15}
                fontSize={11}
                fill="#141F1A"
                textAnchor="middle"
              >
                {groups[gi].label}
              </SvgText>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
