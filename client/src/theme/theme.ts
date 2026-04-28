import { createTheme } from '@mui/material/styles';
import { brandTokens } from './tokens';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    heroDisplay: React.CSSProperties;
    productDisplay: React.CSSProperties;
    sectionDisplay: React.CSSProperties;
    sectionHeading: React.CSSProperties;
    cardHeading: React.CSSProperties;
    featureHeading: React.CSSProperties;
    bodyLarge: React.CSSProperties;
    monoLabel: React.CSSProperties;
    micro: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    heroDisplay?: React.CSSProperties;
    productDisplay?: React.CSSProperties;
    sectionDisplay?: React.CSSProperties;
    sectionHeading?: React.CSSProperties;
    cardHeading?: React.CSSProperties;
    featureHeading?: React.CSSProperties;
    bodyLarge?: React.CSSProperties;
    monoLabel?: React.CSSProperties;
    micro?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    heroDisplay: true;
    productDisplay: true;
    sectionDisplay: true;
    sectionHeading: true;
    cardHeading: true;
    featureHeading: true;
    bodyLarge: true;
    monoLabel: true;
    micro: true;
  }
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: brandTokens.colors.primary,
      contrastText: brandTokens.colors.onPrimary,
    },
    secondary: {
      main: brandTokens.colors.coral,
      light: brandTokens.colors.coralSoft,
      contrastText: brandTokens.colors.ink,
    },
    error: {
      main: brandTokens.colors.error,
    },
    background: {
      default: brandTokens.colors.canvas,
      paper: brandTokens.colors.canvas,
    },
    text: {
      primary: brandTokens.colors.ink,
      secondary: brandTokens.colors.bodyMuted,
    },
    divider: brandTokens.colors.hairline,
  },
  typography: {
    fontFamily: brandTokens.typography.fontFamilyBody,
    h1: {
      fontFamily: brandTokens.typography.fontFamilyDisplay,
      fontSize: brandTokens.typography.heroDisplaySize,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: '-1.92px',
    },
    h2: {
      fontFamily: brandTokens.typography.fontFamilyDisplay,
      fontSize: brandTokens.typography.productDisplaySize,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: '-1.44px',
    },
    h3: {
      fontSize: brandTokens.typography.sectionHeadingSize,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: '-0.48px',
    },
    h4: {
      fontSize: brandTokens.typography.cardHeadingSize,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: '-0.32px',
    },
    h5: {
      fontSize: brandTokens.typography.featureHeadingSize,
      fontWeight: 400,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    body1: {
      fontSize: brandTokens.typography.bodySize,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    body2: {
      fontSize: brandTokens.typography.captionSize,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    button: {
      fontSize: brandTokens.typography.buttonSize,
      fontWeight: 500,
      lineHeight: 1.71,
      letterSpacing: 0,
      textTransform: 'none',
    },
    heroDisplay: {
      fontFamily: brandTokens.typography.fontFamilyDisplay,
      fontSize: brandTokens.typography.heroDisplaySize,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: '-1.92px',
    },
    productDisplay: {
      fontFamily: brandTokens.typography.fontFamilyDisplay,
      fontSize: brandTokens.typography.productDisplaySize,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: '-1.44px',
    },
    sectionDisplay: {
      fontSize: brandTokens.typography.sectionDisplaySize,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: '-1.2px',
    },
    sectionHeading: {
      fontSize: brandTokens.typography.sectionHeadingSize,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: '-0.48px',
    },
    cardHeading: {
      fontSize: brandTokens.typography.cardHeadingSize,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: '-0.32px',
    },
    featureHeading: {
      fontSize: brandTokens.typography.featureHeadingSize,
      fontWeight: 400,
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    bodyLarge: {
      fontSize: brandTokens.typography.bodyLargeSize,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    monoLabel: {
      fontFamily: brandTokens.typography.fontFamilyMono,
      fontSize: brandTokens.typography.buttonSize,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0.28px',
      textTransform: 'uppercase',
    },
    micro: {
      fontSize: brandTokens.typography.microSize,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
  },
  shape: {
    borderRadius: brandTokens.shape.sm,
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: brandTokens.colors.canvas,
          color: brandTokens.colors.ink,
        },
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: brandTokens.shape.pill,
          padding: '12px 24px',
        },
        outlined: {
          borderRadius: brandTokens.shape.xl,
          padding: '6px 12px',
          borderColor: brandTokens.colors.hairline,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: brandTokens.shape.sm,
          border: `1px solid ${brandTokens.colors.cardBorder}`,
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: brandTokens.shape.sm,
          border: `1px solid ${brandTokens.colors.cardBorder}`,
          boxShadow: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: brandTokens.shape.xs,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: brandTokens.colors.borderLight,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: brandTokens.colors.formFocus,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: brandTokens.shape.sm,
        },
        outlined: {
          borderColor: brandTokens.colors.coralSoft,
        },
      },
    },
  },
});

export default theme;
