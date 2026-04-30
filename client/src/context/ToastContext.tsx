import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Alert, { AlertColor } from '@mui/material/Alert';
import Snackbar, { SnackbarCloseReason } from '@mui/material/Snackbar';

type ToastOptions = {
  message: string;
  severity?: AlertColor;
  autoHideDuration?: number;
};

type ToastContextValue = {
  showToast: (toast: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [queue, setQueue] = useState<ToastOptions[]>([]);
  const [activeToast, setActiveToast] = useState<ToastOptions | null>(null);

  const showToast = useCallback((toast: ToastOptions) => {
    setQueue(prev => [...prev, toast]);
  }, []);

  const handleClose = useCallback((_event?: Event | React.SyntheticEvent, reason?: SnackbarCloseReason) => {
    if (reason === 'clickaway') return;
    setActiveToast(null);
  }, []);

  React.useEffect(() => {
    if (activeToast || queue.length === 0) return;
    const [nextToast, ...rest] = queue;
    setActiveToast(nextToast);
    setQueue(rest);
  }, [activeToast, queue]);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={Boolean(activeToast)}
        autoHideDuration={activeToast?.autoHideDuration ?? 4500}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {activeToast ? (
          <Alert
            severity={activeToast.severity ?? 'info'}
            variant="filled"
            onClose={() => setActiveToast(null)}
            sx={{ width: '100%' }}
          >
            {activeToast.message}
          </Alert>
        ) : null}
      </Snackbar>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
