import React from "react";
import Products from "../api/products";
import useMethod from "../hooks/useMethod";
import useSession from "../hooks/useSession";
import useSubscription from "../hooks/useSubscription";
import useTracker from "../hooks/useTracker";
import SlideConfirm from "./SlideConfirm";
import { css } from "emotion";

export default function CartView() {
  const loading = useSubscription("products");
  const products = useTracker(() => Products.find().fetch());
  const [pickedProductIds, setPickedProductIds] = useSession(
    "pickedProductIds",
    [],
  );
  const [doSellProducts] = useMethod("Sales.sellProducts");

  if (loading) return null;
  return (
    <div
      className={css`
        background: rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
      `}
    >
      {pickedProductIds && pickedProductIds.length ? (
        <>
          <ul
            className={css`
              flex: 1;
            `}
          >
            {pickedProductIds
              .map(id => products.find(({ _id }) => id == _id))
              .map((product, i) => (
                <li key={i + product._id}>{product.name}</li>
              ))}
          </ul>
          <div>
            Slide to sell:
            <SlideConfirm
              onConfirm={async () => {
                await doSellProducts({ productIds: pickedProductIds });
                setPickedProductIds([]);
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
