import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { donutArcs } from './scale';
import { colorFor } from './palette';

export interface DonutProps {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
}

/** A category donut. All geometry comes from donutArcs, which is tested. */
export function Donut({ data, size = 180, thickness = 34 }: DonutProps) {
  const arcs = donutArcs(data.map((d) => d.value), { size, thickness });

  return (
    <View>
      <Svg width={size} height={size}>
        {arcs.map((arc, i) => (
          <Path key={data[i].label + i} d={arc.d} fill={colorFor(i)} />
        ))}
      </Svg>
    </View>
  );
}
