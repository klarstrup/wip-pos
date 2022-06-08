import { format, setHours, setMinutes, startOfDay, subHours } from "date-fns";
import { css } from "emotion";
import { groupBy } from "lodash";
import React, { useMemo, useState } from "react";
import Camps from "../api/camps";
import Products, { IProduct } from "../api/products";
import Sales, { ISale } from "../api/sales";
import useCurrentLocation from "../hooks/useCurrentLocation";
import useMongoFetch from "../hooks/useMongoFetch";

const rolloverOffset = 5;

function saveAs(blob: string, type: string, name: string) {
  const a = window.document.createElement("a");
  a.href = window.URL.createObjectURL(new Blob([blob], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const getSaleExpenses = (sale: ISale, products: IProduct[]) =>
  sale.products.reduce((m, saleProduct) => {
    const currentProduct =
      products.find(({ _id }) => _id === saleProduct._id) || saleProduct;
    const shopPrice = (currentProduct.shopPrices || [])
      .filter(({ timestamp }) => timestamp < sale.timestamp)
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))?.[0]?.buyPrice;

    if (!shopPrice) return m + Number(currentProduct.salePrice);

    return m + Number(shopPrice);
  }, 0);

export default function PageSales() {
  const { location, error } = useCurrentLocation(true);
  const { data: camps } = useMongoFetch(Camps.find({}, { sort: { end: -1 } }));
  const [campSlug, setCampSlug] = useState(camps?.[0]?.slug);
  const selectedCamp =
    camps?.find((camp) => camp.slug === campSlug) || camps?.[0];
  const { data: sales } = useMongoFetch(
    Sales.find(
      {
        locationId: location?._id,
        timestamp: {
          $gte: selectedCamp?.start || new Date(new Date().getFullYear(), 0),
          $lte: selectedCamp?.end || new Date(new Date().getFullYear() + 1, 0),
        },
      },
      { sort: { timestamp: -1 } },
    ),
    [location, selectedCamp],
  );
  const { data: products } = useMongoFetch(
    Products.find({ removedAt: { $exists: false } }),
  );
  const salesByDay = useMemo(
    () =>
      Object.entries(
        groupBy(sales, ({ timestamp }) =>
          startOfDay(subHours(timestamp, rolloverOffset)).toISOString(),
        ),
      )
        .map(([date, data]) => [new Date(date), data] as const)
        .sort(([a], [b]) => Number(a) - Number(b)),
    [sales],
  );

  if (error) return error;

  return (
    <div>
      <select
        value={campSlug || camps?.[0]?.slug}
        onChange={({ target }) => setCampSlug(target.value)}
      >
        {camps.map(({ slug, name }) => (
          <option key={slug} value={slug}>
            {name}
          </option>
        ))}
      </select>
      <ul
        className={css`
          padding: 0;
          margin: 0;
          list-style: none;
        `}
      >
        {salesByDay.map(([day, salesOfDay], i) => (
          <li
            key={Number(day)}
            className={css`
              padding: 0 4px;
              border: 2px solid red;
            `}
          >
            <details open={i === salesByDay.length - 1 ? true : undefined}>
              <summary
                className={css`
                  white-space: nowrap;
                `}
              >
                {format(day, "DD/MM/YYYY")}{" "}
                <code>
                  <b>
                    {salesOfDay.reduce(
                      (memo, { amount }) => memo + Number(amount),
                      0,
                    )}
                  </b>
                  <span style={{ color: "limegreen" }}>
                    (+{" "}
                    {salesOfDay
                      .map(
                        (sale) => sale.amount - getSaleExpenses(sale, products),
                      )
                      .reduce((memo, profit) => memo + Number(profit))}
                    )
                  </span>
                </code>
                <small>{salesOfDay[0].currency}</small>{" "}
                <small>
                  <button
                    type="button"
                    disabled={!location}
                    onClick={() => {
                      const statements = salesOfDay.map((sale) => ({
                        timestamp: sale.timestamp,
                        amount: sale.amount,
                        cost: getSaleExpenses(sale, products),
                      }));

                      saveAs(
                        JSON.stringify(statements),
                        "application/json;charset=utf-8;",
                        `${location?.slug}-${format(day, "YYYY-MM-DD")}.json`,
                      );
                    }}
                  >
                    Download as JSON
                  </button>
                </small>
              </summary>
              <ul>
                {salesOfDay.map((sale) => (
                  <li key={sale._id}>
                    {format(sale.timestamp, "HH:mm:ss")}{" "}
                    <code>
                      <b>{sale.amount}</b>
                      <span style={{ color: "limegreen" }}>
                        (+ {sale.amount - getSaleExpenses(sale, products)})
                      </span>
                    </code>
                    <small>{sale.currency}</small>
                    <ul>
                      {sale.products.map((product, i) => (
                        <li key={sale._id + i + product._id}>
                          {product.brandName ? (
                            <>{product.brandName} - </>
                          ) : null}{" "}
                          {product.name}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <small>
        Date rollover at{" "}
        {format(setMinutes(setHours(new Date(), rolloverOffset), 0), "HH:mm")}
      </small>
    </div>
  );
}
