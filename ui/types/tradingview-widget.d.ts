interface Window {
  TradingView: {
    widget: new (config: TradingViewWidgetConfig) => any;
  };
}

interface TradingViewWidgetConfig {
  container_id: string;
  autosize?: boolean;
  symbol: string;
  interval: string;
  timezone?: string;
  theme?: 'light' | 'dark';
  style?: string;
  locale?: string;
  toolbar_bg?: string;
  enable_publishing?: boolean;
  hide_top_toolbar?: boolean;
  hide_legend?: boolean;
  save_image?: boolean;
  studies?: string[];
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  gridColor?: string;
  hide_side_toolbar?: boolean;
  allow_symbol_change?: boolean;
  details?: boolean;
  hotlist?: boolean;
  calendar?: boolean;
}
