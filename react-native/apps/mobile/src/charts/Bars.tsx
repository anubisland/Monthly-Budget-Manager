import React from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { barLayout, niceTicks } from './scale';
import { colorFor } from './palette';

export interface BarsProps {
  data: { label: string; value: number; colorIndex?: number }[];
  width: number;
  height?: number;
  formatValue?: (v: number) => string;
}

/**
 * A bar chart. Every coordinate comes from barLayout/niceTicks, which are
 * tested; this component only maps them onto SVG elements.
 */
export function Bars({ data, width, height = 180, formatValue }: BarsProps) {
  const axisWidth = 44;
  const labelHeight = 22;
  const plotWidth = Math.max(0, width - axisWidth);
  const plotHeight = Math.max(0, height - labelHeight);

  const values = data.map((d) => d.value);
  const ticks = niceTicks(Math.max(...values, 0));
  const axisMax = ticks[ticks.length - 1];
  // Scaled against the AXIS maximum, so the tallest bar meets the top
  // gridline rather than overshooting it.
  const bars = barLayout(values, {
    width: plotWidth,
    height: plotHeight,
    gap: 14,
    max: axisMax,
  });

  return (
    <View>
      <Svg width={width} height={height}>
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
          {bars.map((b, i) => (
            <Rect
              key={data[i].label + i}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              rx={3}
              fill={colorFor(data[i].colorIndex ?? i)}
            />
          ))}
          {bars.map((b, i) => (
            <SvgText
              key={`l${data[i].label}${i}`}
              x={b.x + b.width / 2}
              y={plotHeight + 15}
              fontSize={11}
              fill="#141F1A"
              textAnchor="middle"
            >
              {data[i].label}
            </SvgText>
          ))}
        </G>
      </Svg>
    </View>
  );
}
