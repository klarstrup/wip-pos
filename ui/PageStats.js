import {
  addDays,
  endOfHour,
  isAfter,
  isPast,
  min,
  setHours,
  startOfHour,
} from "date-fns";
import { css } from "emotion";
import React, { useMemo } from "react";
import Countdown from "react-countdown";
import Camps from "../api/camps";
import Products from "../api/products";
import Sales from "../api/sales";
import CampByCamp from "../components/CampByCamp";
import SalesSankey from "../components/SalesSankey";
import useMongoFetch from "../hooks/useMongoFetch";

const rolloverOffset = 5;
const renderer = ({ hours, minutes, seconds, completed }) => {
  return (
    <span
      className={css`
        font-size: 5em;
        display: inline-block;
        transform-origin: 50% 50%;
        ${hours == 0 && minutes <= 4
          ? `animation: blink-animation 1s steps(5, start) infinite, flash-animation 500ms steps(5, start) infinite, shake 300ms infinite;`
          : hours == 0 && minutes <= 14
          ? `animation: blink-animation 1s steps(5, start) infinite, flash-animation 500ms steps(5, start) infinite;`
          : hours == 0
          ? `animation: blink-animation 1s steps(5, start) infinite;`
          : ""}
      `}
    >
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
      {String(seconds).padStart(2, "0")}
    </span>
  );
};

export default function PageStats() {
  const currentDate = new Date();
  const {
    data: [currentCamp],
    loading: campsLoading,
  } = useMongoFetch(Camps.find({}, { sort: { end: -1 } }));
  const from = startOfHour(
    setHours(
      isPast(currentCamp?.start) ? currentCamp?.start : currentCamp?.buildup,
      rolloverOffset,
    ),
  );
  const to = endOfHour(
    min(setHours(currentCamp?.end, rolloverOffset), currentDate),
  );

  const { data: sales, loading: salesLoading } = useMongoFetch(
    Sales.find({ timestamp: { $gt: from, $lt: to } }),
    [from, to],
  );
  const { data: products, loading: productsLoading } = useMongoFetch(
    Products.find({ removedAt: { $exists: false } }),
  );
  const mostSold = useMemo(
    () =>
      Object.entries(
        sales.reduce((m, sale) => {
          sale.products.forEach((product) => {
            m[product._id] = m[product._id] ? m[product._id] + 1 : 1;
          });
          return m;
        }, {}),
      ).sort(([, a], [, b]) => b - a),
    [sales],
  );
  if (salesLoading || productsLoading || campsLoading) return "Loading...";

  const next2am = isAfter(startOfHour(setHours(currentDate, 6)), currentDate)
    ? startOfHour(setHours(currentDate, 2))
    : startOfHour(setHours(addDays(currentDate, 1), 2));
  return (
    <div
      className={css`
        padding-top: 8px;
        font-family: monospace;
        display: flex;
        height: 100%;
      `}
    >
      <div
        className={css`
          flex: 2;
          height: 100%;
        `}
      >
        <SalesSankey />
        <br />
        <CampByCamp />
      </div>
      <div
        className={css`
          padding-left: 32px;
          flex: 1;
        `}
      >
        <center>
          <big>
            <Countdown date={next2am} renderer={renderer} daysInHours />
            <br />
            <span
              className={css`
                font-size: 3.5em;
              `}
            >
              TILL CURFEW
            </span>
          </big>
        </center>
        <hr />
        Most sold @ {currentCamp?.name}:
        <ul
          className={css`
            padding: 0;
          `}
        >
          {mostSold.map(([productId, count]) => {
            const product = products.find(({ _id }) => _id == productId);
            if (!product) return null;
            return (
              <li
                key={productId}
                className={css`
                  list-style: none;
                  display: flex;
                  align-items: flex-start;
                `}
              >
                <div
                  className={css`
                    width: 50px;
                    text-align: right;
                    margin-right: 8px;
                  `}
                >
                  <b>{count}</b>x
                </div>
                <div>
                  {product.brandName ? <>{product.brandName} - </> : null}
                  {product.name}({product.unitSize}
                  {product.sizeUnit})
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
