import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { getSubscriptionUnitPrice } from "../data/subscriptions.js";
import { sanitizeSubscriptionMetadata } from "../data/products.js";

export const CART_STORAGE_KEY = "PS_CART_V1";

const CartContext = createContext(null);

const createLineId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const readCartFromStorage = () => {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        if (item.category !== "subscription") return item;
        return {
          ...item,
          metadata: sanitizeSubscriptionMetadata(item.metadata),
        };
      });
  } catch (error) {
    return [];
  }
};

const getInitialState = () => ({
  items: readCartFromStorage(),
});

const resolveTierId = (item) => {
  if (item?.metadata?.tier) return item.metadata.tier;
  if (item?.productId?.startsWith("subscription-")) {
    return item.productId.replace("subscription-", "");
  }
  return "";
};

const applySubscriptionBilling = (item, billingPeriod) => {
  const tierId = resolveTierId(item);
  if (!tierId) return item;
  const clusterSizeId = item.metadata?.clusterSize || "";
  const unitPrice = getSubscriptionUnitPrice({
    tierId,
    billingPeriod,
    clusterSizeId,
  });
  return {
    ...item,
    unitPrice,
    billingPeriod,
    metadata: sanitizeSubscriptionMetadata({
      ...item.metadata,
      tier: tierId,
      billingPeriod,
      clusterSize: clusterSizeId,
    }),
  };
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case "add": {
      const payload = action.payload;
      if (!payload) return state;
      const normalizedPayload =
        payload.category === "subscription"
          ? {
              ...payload,
              metadata: sanitizeSubscriptionMetadata(payload.metadata),
            }
          : payload;
      return {
        ...state,
        items: [...state.items, { lineId: createLineId(), ...normalizedPayload }],
      };
    }
    case "remove":
      return {
        ...state,
        items: state.items.filter((item) => item.lineId !== action.payload),
      };
    case "clear":
      return { items: [] };
    case "billing":
      return {
        ...state,
        items: state.items.map((item) =>
          item.category === "subscription" ? applySubscriptionBilling(item, action.payload) : item
        ),
      };
    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, undefined, getInitialState);

  const addItem = (item) => dispatch({ type: "add", payload: item });
  const removeItem = (lineId) => dispatch({ type: "remove", payload: lineId });
  const clearCart = () => dispatch({ type: "clear" });
  const updateSubscriptionBilling = (billingPeriod) =>
    dispatch({ type: "billing", payload: billingPeriod });

  const totals = useMemo(() => {
    return state.items.reduce(
      (acc, item) => {
        const lineTotal = item.unitPrice * item.quantity;
        if (item.category === "subscription") {
          acc.subscriptionSubtotal += lineTotal;
        } else {
          acc.oneOffSubtotal += lineTotal;
        }
        acc.subtotal += lineTotal;
        return acc;
      },
      { subtotal: 0, oneOffSubtotal: 0, subscriptionSubtotal: 0 }
    );
  }, [state.items]);

  const value = useMemo(
    () => ({
      items: state.items,
      addItem,
      removeItem,
      clearCart,
      updateSubscriptionBilling,
      totals,
    }),
    [state.items, totals]
  );

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
  }, [state.items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
