import { init, use } from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// The dashboard only renders a line chart and a donut chart. Registering the
// required ECharts pieces here keeps the rest of the chart library out of the
// production chunk while preserving lazy loading at the page level.
use([
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  GraphicComponent,
  LabelLayout,
  CanvasRenderer,
]);

export { init };
