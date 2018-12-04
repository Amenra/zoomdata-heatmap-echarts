/* FYI:
  Echarts can be loading as npm package (1) or as a customized minifed js file (2),
  which save up to 400KB in the latter case
*/
/* import echarts from 'echarts'; // (1) */
import echarts from '../resources/echarts.customized.min.js'; /* (2) */

import {
  curry,
  debounce,
  filter,
  groupBy,
  keys,
  map,
  min,
  maxBy,
  pipe,
  trimEnd,
  truncate,
} from 'lodash/fp';
import styles from './index.css';

// create chart container
const chartContianer = document.createElement('div');
chartContianer.classList.add(styles.chartContainer);
chartContianer.style.width = '100%';
chartContianer.style.height = '100%';
controller.element.appendChild(chartContianer);

// define data accessors
const multiGroupAccessor = controller.dataAccessors['Multi Group By'];
const metricAccessor = controller.dataAccessors['Color Metric'];

// create utility functions
const trace = curry((tag, x) => {
  console.log(tag, x);
  return x;
});

const getGroup1 = d => multiGroupAccessor.formatted(d)[0].toString();

const getGroup2 = d => multiGroupAccessor.formatted(d)[1].toString();

const getMetricValue = d => metricAccessor.raw(d);

const getFormattedValue = d => metricAccessor.formatted(d);

const getColor = d => metricAccessor.color(d);

const distinctGroup1 = pipe(groupBy(getGroup1), keys);

const distinctGroup2 = pipe(groupBy(getGroup2), keys);

const luminosity = color => {
  const rgb = typeof color === 'string' ? echarts.color.parse(color) : color;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; // SMPTE C, Rec. 709 weightings
};

const contrastingColor = luma => (luma >= 165 ? '#000' : '#fff');

const blackOrWhiteText = pipe(getColor, luminosity, contrastingColor);

const getDatum = params => params.data.datum;

const axisLabel = pipe(trimEnd, truncate({ length: 20 }));

const seriesLabel = params => {
  const datum = getDatum(params);
  const labelText = getFormattedValue(datum);
  const ecModel = chart.getModel();
  const seriesComponent = ecModel.getComponent('series');
  const labelRect = seriesComponent
    .getModel('label.normal')
    .getTextRect(labelText);
  const xBandWidth = seriesComponent.coordinateSystem
    .getAxis('x')
    .getBandWidth();
  const yBandWidth = seriesComponent.coordinateSystem
    .getAxis('y')
    .getBandWidth();
  return labelRect.width > xBandWidth || labelRect.height > yBandWidth
    ? ' '
    : labelText;
};

const dataItem = d => ({
  datum: d,
  value: [getGroup1(d), getGroup2(d), getMetricValue(d)],
  label: {
    color: blackOrWhiteText(d),
  },
  itemStyle: {
    color: getColor(d),
  },
});
const heatmapData = map(dataItem);

// register function with echarts to be called on chart redraw
echarts.registerProcessor(ecModel => {
  const gridComponent = ecModel.getComponent('grid');
  const xAxisComponent = ecModel.getComponent('xAxis');
  const yAxisComponent = ecModel.getComponent('yAxis');
  const xAxis = xAxisComponent.axis;
  const yAxis = yAxisComponent.axis;
  const seriesComponent = ecModel.getComponent('series');
  const xAxisData = xAxisComponent.getCategories();
  const yAxisData = yAxisComponent.getCategories();

  const getXLabelRect = str =>
    xAxisComponent.getModel('axisLabel').getTextRect(axisLabel(str));
  const getYLabelRect = str =>
    yAxisComponent.getModel('axisLabel').getTextRect(axisLabel(str));
  const getLabelWidth = function(labelRect) {
    return labelRect.width;
  };
  const widestX = pipe(map(getXLabelRect), maxBy(getLabelWidth));
  const widestY = pipe(map(getYLabelRect), maxBy(getLabelWidth));
  let labelRectX = widestX(xAxisData);
  let labelRectY = widestY(yAxisData);

  gridComponent.option.top =
    margin.top + labelRectX.height + xAxis.model.get('axisLabel.margin');
  gridComponent.option.left =
    margin.left + labelRectY.width + yAxis.model.get('axisLabel.margin');
  let xBandWidth =
    (chart.getWidth() - gridComponent.option.left - margin.right) /
    xAxisData.length;
  let yBandWidth =
    (chart.getHeight() -
      ecModel.getComponent('grid').option.top -
      margin.bottom) /
    yAxisData.length;
  xAxisComponent.option.axisLabel.rotate = 0;

  if (xBandWidth <= labelRectX.width) {
    xAxisComponent.option.axisLabel.rotate = -90;
    gridComponent.option.top =
      margin.top + labelRectX.width + xAxis.model.get('axisLabel.margin');
    yBandWidth =
      (chart.getHeight() -
        ecModel.getComponent('grid').option.top -
        margin.bottom) /
      yAxisData.length;
    const textBandWidthRatio = labelRectX.height / xBandWidth;
    xAxisComponent.option.axisLabel.interval =
      textBandWidthRatio <= 1 ? 0 : Math.ceil(textBandWidthRatio) - 1;

    if (xAxisComponent.option.axisLabel.interval > 0) {
      const skip = xAxisComponent.option.axisLabel.interval + 1;
      let filterFp = filter.convert({ cap: false });
      const everyX = function(d, i) {
        return i % skip === 0;
      };
      labelRectX = widestX(filterFp(everyX, xAxisData));
      gridComponent.option.top =
        margin.top + labelRectX.width + xAxis.model.get('axisLabel.margin');
      yBandWidth =
        (chart.getHeight() -
          ecModel.getComponent('grid').option.top -
          margin.bottom) /
        yAxisData.length;
    }
  }

  const textBandWidthRatioY = labelRectY.height / yBandWidth;
  yAxisComponent.option.axisLabel.interval =
    textBandWidthRatioY <= 1 ? 0 : Math.ceil(textBandWidthRatioY) - 1;

  if (yAxisComponent.option.axisLabel.interval > 0) {
    const skip = yAxisComponent.option.axisLabel.interval + 1;
    let filterFp = filter.convert({ cap: false });
    const everyY = function(d, i) {
      return i % skip === 0;
    };
    labelRectY = widestY(filterFp(everyY, yAxisData));
    gridComponent.option.left =
      margin.left + labelRectY.width + yAxis.model.get('axisLabel.margin');
    xBandWidth =
      (chart.getWidth() -
        ecModel.getComponent('grid').option.left -
        margin.right) /
      xAxisData.length;
  }

  const minBandWidth = min([xBandWidth, yBandWidth]);
  minBandWidth <= 5
    ? (seriesComponent.option.itemStyle.borderWidth = 0)
    : (seriesComponent.option.itemStyle.borderWidth = 1);
});

// instantiate echarts
const chart = echarts.init(chartContianer);

// Configure default chart options
const axisOption = {
  axisLine: { show: false },
  axisTick: { show: false },
  type: 'category',
};

const margin = {
  top: 0,
  left: 5,
  right: 0,
  bottom: 5,
};

const option = {
  grid: {
    show: true,
    top: margin.top,
    left: margin.left,
    right: margin.right,
    bottom: margin.bottom,
    backgroundColor: '#cccccc',
    borderColor: '#f1f1f1',
    borderWidth: 1,
  },
  xAxis: {
    ...axisOption,
    position: 'top',
    axisLabel: {
      formatter: axisLabel,
      interval: 0,
    },
  },
  yAxis: {
    ...axisOption,
    inverse: true,
    axisLabel: {
      formatter: axisLabel,
      interval: 0,
    },
  },
  series: [
    {
      type: 'heatmap',
      dimensions: ['group 1', 'group 2', 'metric'],
      encode: {
        x: 'group 2',
        y: 'group 1',
      },
      label: {
        show: true,
        formatter: seriesLabel,
      },
      itemStyle: {
        borderWidth: 1,
        borderColor: '#f1f1f1',
      },
      emphasis: {
        itemStyle: {
          borderWidth: 1,
          borderColor: '#323232',
        },
      },
    },
  ],
};

controller.update = data => {
  if (getMetricValue(data[0]) === undefined) {
    return;
  }
  option.xAxis.data = distinctGroup2(data);
  option.yAxis.data = distinctGroup1(data);
  option.series[0].data = heatmapData(data);
  chart.setOption(option);
};

controller.resize = debounce(200, (width, height) => {
  chart.resize();
});

// create axis labels
controller.createAxisLabel({
  picks: 'Multi Group By', // Variable Name
  orientation: 'horizontal',
  position: 'bottom',
});

controller.createAxisLabel({
  picks: 'Color Metric', // Variable Name
  orientation: 'horizontal',
  position: 'bottom',
});

chart.on('click', params => {
  controller.menu.show({
    event: params.event.event,
    data: () => params.data.datum,
  });
});

chart.on('mousemove', ({ event, data } = {}) => {
  controller.tooltip.show({
    event: event.event,
    data: () => data.datum,
    content: () => tooltipView(getDataItems(data.datum)),
  });
});

chart.on('mouseout', () => {
  controller.tooltip.hide();
});

// Helpers
function getDataItems(dataItem) {
  const colorMetric = metricAccessor.getMetric();
  const dataItemsArray = [
    {
      label: multiGroupAccessor.getLabels()[0],
      value: multiGroupAccessor.formatted(dataItem)[0],
      func: null,
      percentage: null,
      showColorIcon: false,
    },
    {
      label: multiGroupAccessor.getLabels()[1],
      value: multiGroupAccessor.formatted(dataItem)[1],
      func: null,
      percentage: null,
      showColorIcon: false,
    },
  ];
  const volume = controller.source.volumeMetric;
  const metricDataItems = [
    {
      label: volume.label,
      func: null,
      value: controller.metricFormatter.format(dataItem.current.count),
      percentage: null,
      showColorIcon: colorMetric.name === volume.name,
    },
  ];

  if (colorMetric.name !== volume.name) {
    metricDataItems.push({
      label: metricAccessor.getLabel(),
      func: colorMetric.func,
      value: metricAccessor.formatted(dataItem),
      percentage: null,
      showColorIcon: true,
    });
  }

  return dataItemsArray.concat(metricDataItems);
}

function tooltipView(dataItems) {
  const contentElement = document.createElement('div');

  const innerContentElement = document.createElement('div');
  innerContentElement.setAttribute('class', 'zd_tooltip_info_group customized');

  const tableElement = document.createElement('div');
  tableElement.setAttribute('class', 'zd_tooltip_info_table');

  for (const dataItem of dataItems) {
    const rowElement = getRow(dataItem);
    tableElement.appendChild(rowElement);
  }

  innerContentElement.appendChild(tableElement);
  contentElement.appendChild(innerContentElement);

  return contentElement.innerHTML;
}

function getRow(item) {
  const rowElement = document.createElement('div');
  rowElement.setAttribute('class', 'zd_tooltip_info_table_row');

  const rowLabelElement = document.createElement('div');
  rowLabelElement.setAttribute('class', 'zd_tooltip_info_table_row_label');

  const rowValueElement = document.createElement('div');
  rowValueElement.setAttribute('class', 'zd_tooltip_info_table_row_value');

  const value = `${item.value}${(item.percentage ?' (' + item.percentage + '%)' : '')}`;

  let label;
  if (item.func !== null) {
    const itemFunc =
      item.func.toLowerCase() === 'distinct_count'
        ? 'Distinct Count'
        : item.func.charAt(0).toUpperCase() + item.func.slice(1);

    label = item.label + ' (' + itemFunc + ')';
  } else {
    label = item.label;
  }

  if (item.showColorIcon) {
    const colorIconElement = document.createElement('div');
    colorIconElement.setAttribute('class', 'zd_color_icontooltip_info_group active');
    colorIconElement.style['background-color'] = getColor(dataItem);

    rowValueElement.append(colorIconElement);
  }

  rowLabelElement.innerText = label;
  rowValueElement.innerText = value;

  rowElement.appendChild(rowLabelElement);
  rowElement.appendChild(rowValueElement);

  return rowElement;
}