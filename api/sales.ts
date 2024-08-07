import convert from "convert";
import {
  addHours,
  differenceInHours,
  endOfHour,
  isFuture,
  isWithinRange,
  min,
  subHours,
} from "date-fns";
import { groupBy, sumBy } from "lodash";
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import type { CartID } from "../ui/PageTend";
import { emptyArray, type Flavor } from "../util";
import { isUserInTeam } from "./accounts";
import Camps, { type ICamp } from "./camps";
import Locations, { type ILocation } from "./locations";
import Products, {
  isAlcoholic,
  isMate,
  type IProduct,
  type ProductID,
} from "./products";
import Stocks from "./stocks";

export type SaleID = Flavor<string, "SaleID">;

export interface ISale {
  _id: SaleID;
  userId?: string;
  cartId?: string;
  locationId: string;
  currency?: string;
  country?: string;
  amount: number;
  timestamp: Date;
  products: IProduct[];
}

const Sales = new Mongo.Collection<ISale>("sales");
if (Meteor.isServer) {
  Sales.createIndex({ timestamp: -1 });
}

export const salesMethods = {
  async "Sales.sellProducts"(
    this: Meteor.MethodThisType,
    {
      locationSlug,
      cartId,
      productIds,
    }: {
      locationSlug: ILocation["slug"];
      cartId: CartID;
      productIds: ProductID[];
    },
  ) {
    if (this.isSimulation) return;
    if (!locationSlug || !productIds) throw new Meteor.Error("misisng");
    const { userId } = this;
    if (!userId) throw new Meteor.Error("log in please");
    const location = Locations.findOne({ slug: locationSlug });
    if (!location) throw new Meteor.Error("invalid location");

    if (!isUserInTeam(userId, location.teamName))
      throw new Meteor.Error("Wait that's illegal");

    const existingSale = Sales.findOne({ cartId });
    if (existingSale) {
      throw new Meteor.Error("CART_ALREADY_SOLD", "Cart already sold");
    }

    const insertResult = Sales.insert({
      userId: userId!,
      locationId: location!._id,
      cartId,
      currency: "HAX",
      country: "DK",
      amount: productIds.reduce(
        (m: number, _id) => m + Number(Products.findOne({ _id })?.salePrice),
        0,
      ),
      timestamp: new Date(),
      products: productIds.map((_id) => Products.findOne({ _id })!),
    });

    try {
      for (const _id of productIds) {
        const product = Products.findOne({ _id });
        if (!product || !product.components?.length) continue;

        for (const component of product.components) {
          const stock = Stocks.findOne({ _id: component.stockId });
          if (!stock) continue;
          if (!component.unitSize) continue;
          if (!component.sizeUnit) continue;
          if (!stock.unitSize) continue;
          if (!stock.sizeUnit) continue;
          if (!stock.approxCount) continue;

          const componentInStockSize =
            component.sizeUnit !== stock.sizeUnit &&
            component.sizeUnit !== "pc" &&
            stock.sizeUnit !== "pc" &&
            component.sizeUnit !== "g" &&
            stock.sizeUnit !== "g"
              ? convert(+component.unitSize, component.sizeUnit).to(
                  stock.sizeUnit,
                )
              : component.sizeUnit === "g" && stock.sizeUnit === "g"
              ? convert(+component.unitSize, component.sizeUnit).to(
                  stock.sizeUnit,
                )
              : Number(component.unitSize);

          const newApproxCount =
            (stock.approxCount * Number(stock.unitSize) -
              componentInStockSize) /
            Number(stock.unitSize);
          if (!Number.isNaN(newApproxCount)) {
            Stocks.update(component.stockId, {
              $set: { approxCount: newApproxCount },
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to update stocks after sale", e);
    }

    return insertResult;
  },

  async "Sales.stats.CampByCamp"(this: Meteor.MethodThisType) {
    this.unblock();
    if (this.isSimulation) return;

    return statsCampByCamp;
  },

  async "Sales.stats.SalesSankey"(
    this: Meteor.MethodThisType,
    { campSlug }: { campSlug: ICamp["slug"] },
  ) {
    this.unblock();
    if (this.isSimulation) return;

    return statsSalesSankey?.data[campSlug];
  },

  async "Sales.stats.DayByDay"(
    this: Meteor.MethodThisType,
    { campSlug }: { campSlug: ICamp["slug"] },
  ) {
    this.unblock();
    if (this.isSimulation) return;

    return statsDayByDay?.data[campSlug];
  },

  async "Products.menu.Menu"(
    this: Meteor.MethodThisType,
    { locationSlug }: { locationSlug: ILocation["slug"] },
  ) {
    this.unblock();
    if (this.isSimulation) return;

    return locationMenuData?.[locationSlug];
  },

  async "Sales.stats.GoodbyeWorld"(
    this: Meteor.MethodThisType,
    { campSlug }: { campSlug: ICamp["slug"] },
  ) {
    this.unblock();
    if (this.isSimulation) return;

    const [currentCamp] = await Camps.find({ slug: campSlug }).fetchAsync();

    if (!currentCamp) throw new Meteor.Error("Camp not found");

    const campSales = await Sales.find({
      timestamp: { $gte: currentCamp.buildup, $lte: currentCamp.teardown },
    }).fetchAsync();

    const productsSold = campSales.map(({ products }) => products).flat();

    return `${campSales.reduce(
      (revenue, { amount }) => revenue + amount,
      0,
    )} ʜᴀx revenue
  ${productsSold.length} items sold
  ${campSales.length} discrete transactions
   ${Math.round(
     productsSold
       .filter(({ tags }) => tags?.includes("beer"))
       .reduce(
         (totalLiters, { unitSize, sizeUnit }) =>
           unitSize && sizeUnit === "cl"
             ? totalLiters + Number(unitSize) / 100
             : totalLiters,
         0,
       ),
   )} liters of beer
   ${Math.round(
     productsSold
       .filter(
         ({ brandName }) =>
           brandName === "Club Mate" || brandName === "Mio Mio",
       )
       .reduce(
         (totalLiters, { unitSize, sizeUnit }) =>
           unitSize && sizeUnit === "cl"
             ? totalLiters + Number(unitSize) / 100
             : totalLiters,
         0,
       ),
   )} liters of mate
   ${
     productsSold.filter(({ tags }) => tags?.includes("cocktail")).length
   } cocktails
    ${
      productsSold.filter(({ name }) => name.includes("Tsunami")).length
    } tsunamis`;
  },
} as const;

let statsCampByCamp: Awaited<
  ReturnType<typeof calculateCampByCampStats>
> | null = null;
let statsSalesSankey: Awaited<
  ReturnType<typeof calculateSalesSankeyData>
> | null = null;
let locationMenuData: Awaited<ReturnType<typeof calculateMenuData>> | null =
  null;
let statsDayByDay: Awaited<ReturnType<typeof calculateDayByDayStats>> | null =
  null;
if (Meteor.isServer) {
  Meteor.startup(async () => {
    console.log("Startup statsing");
    [statsCampByCamp, statsSalesSankey, statsDayByDay, locationMenuData] =
      await Promise.all([
        calculateCampByCampStats(),
        calculateSalesSankeyData(),
        calculateDayByDayStats(),
        calculateMenuData(),
      ]);

    
    setInterval(async () => {
      [statsCampByCamp, statsSalesSankey, statsDayByDay] = await Promise.all([
        calculateCampByCampStats(),
        calculateSalesSankeyData(),
        calculateDayByDayStats(),
      ]);
    }, 240_000);

    setInterval(async () => {
      [locationMenuData] = await Promise.all([calculateMenuData()]);
    }, 20_000);
  });
}

const HOUR_IN_MS = 3600 * 1000;
const offset = -6;
async function calculateCampByCampStats() {
  const now = new Date();

  const [camps, sales] = await Promise.all([
    Camps.find(
      {},
      { sort: { start: 1 }, fields: { slug: 1, start: 1, end: 1 } },
    ).fetchAsync() as Promise<Pick<ICamp, "slug" | "start" | "end">[]>,
    Sales.find(
      {},
      { fields: { timestamp: 1, amount: 1 } },
    ).fetchAsync() as Promise<Pick<ISale, "_id" | "amount" | "timestamp">[]>,
  ]);

  const now2 = new Date();

  const longestCamp = camps.reduce<Pick<
    ICamp,
    "slug" | "start" | "end"
  > | null>((memo, camp) => {
    if (!memo) return camp;

    if (
      Number(camp.end) - Number(camp.start) >
      Number(memo.end) - Number(memo.start)
    ) {
      memo = camp;
    }
    return memo;
  }, null);

  const longestCampHours = longestCamp
    ? differenceInHours(longestCamp.end, longestCamp.start)
    : 0;

  const data: { [key: string]: number; hour: number }[] = [];
  const campTotals: Record<string, number> = {};
  for (let i = 0; i < longestCampHours; i++) {
    // avoid blocking the event loop for too long at a time
    await new Promise((y) => setImmediate(y));

    const datapoint: (typeof data)[number] = { hour: i };

    for (const { slug, start } of camps) {
      const hourStart = Number(start) + (i + offset) * HOUR_IN_MS;
      const hourEnd = hourStart + HOUR_IN_MS;

      let count = 0;
      for (const { timestamp, amount } of sales) {
        const ts = Number(timestamp);

        if (ts >= hourStart && ts < hourEnd) count += amount;
      }

      if (count) {
        campTotals[slug] = datapoint[slug] = (campTotals[slug] || 0) + count;
      }
    }

    data.push(datapoint);
  }
  const now3 = new Date();

  console.log(
    `Sales.stats.CampByCamp: ${(now3.getTime() - now.getTime()) / 1000}s,(${
      (now2.getTime() - now.getTime()) / 1000
    }s fetch, ${(now3.getTime() - now2.getTime()) / 1000}s calc)`,
  );

  return { data };
}
async function calculateDayByDayStats() {
  const now = new Date();

  const [camps, sales] = await Promise.all([
    Camps.find({}, { sort: { end: -1 } }).fetchAsync(),
    Sales.find().fetchAsync(),
  ]);

  const now2 = new Date();

  const data: Record<
    ICamp["slug"],
    {
      x: number;
      [key: string]: number | null;
    }[]
  > = {};
  for (const currentCamp of camps) {
    const numberOfDaysInCurrentCamp = currentCamp
      ? Math.ceil(
          differenceInHours(
            min(new Date(), currentCamp.end),
            currentCamp.start,
          ) / 24,
        )
      : 0;

    data[currentCamp.slug] = currentCamp
      ? Array.from({ length: 24 }, (_, i) =>
          Array.from({ length: numberOfDaysInCurrentCamp }).reduce<{
            x: number;
            [key: string]: number | null;
          }>(
            (memo, _, j) => {
              const hour: number = j * 24 + i;

              if (isFuture(addHours(currentCamp.start, hour + offset)))
                return memo;

              return {
                ...memo,
                [j]: sumBy(
                  sales.filter((sale) =>
                    isWithinRange(
                      sale.timestamp,
                      addHours(currentCamp.start, j * 24 + offset),
                      endOfHour(addHours(currentCamp.start, hour + offset)),
                    ),
                  ),
                  "amount",
                ),
              };
            },
            { x: i },
          ),
        )
      : emptyArray;
  }

  const now3 = new Date();

  console.log(
    `Sales.stats.DayByDay: ${(now3.getTime() - now.getTime()) / 1000}s,(${
      (now2.getTime() - now.getTime()) / 1000
    }s fetch, ${(now3.getTime() - now2.getTime()) / 1000}s calc)`,
  );

  return { data };
}

async function calculateSalesSankeyData() {
  const now = new Date();

  const [camps, allSales, allProducts] = await Promise.all([
    Camps.find({}, { sort: { end: -1 } }).fetchAsync(),
    Sales.find().fetchAsync(),
    Products.find().fetchAsync(),
  ]);

  const now2 = new Date();

  const data: Record<
    ICamp["slug"],
    {
      links: { value: number; source: number; target: number }[];
      nodes: { color: string; name: string }[];
    }
  > = {};
  for (const currentCamp of camps) {
    const campSales = allSales.filter((sale) =>
      isWithinRange(sale.timestamp, currentCamp.buildup, currentCamp.teardown),
    );

    const sales = campSales?.length ? campSales : allSales;

    const productsSold = sales.reduce<IProduct[]>((memo, sale) => {
      for (const saleProduct of sale.products) {
        const product = allProducts.find(({ _id }) => _id === saleProduct._id);
        if (product) memo.push(product);
      }
      return memo;
    }, []);

    const salesNode: `Sales (${string})` =
      currentCamp && campSales?.length
        ? `Sales (${currentCamp.name})`
        : "Sales (all time)";

    const nodes = [
      { color: "", name: salesNode },
      { color: "#FFED00", name: "Alcoholic" },
      { color: "#FFED00", name: "Beer" },
      { color: "#FFED00", name: "Tap" },
      { color: "#FFED00", name: "Non-Tap" },
      { color: "#D2691E", name: "Non-Beer" },
      { color: "#D2691E", name: "Cocktail" },
      { color: "#D2691E", name: "Non-Cocktail" },
      { color: "#193781", name: "Non-Alcoholic" },
      { color: "#193781", name: "Mate" },
      { color: "#16503f", name: "Non-Mate" },
    ] as const;

    const getNode = (name: (typeof nodes)[number]["name"]) =>
      nodes.findIndex((node) => node.name === name);

    const links = [
      {
        source: getNode(salesNode),
        target: getNode("Alcoholic"),
        value: productsSold.filter((product) => isAlcoholic(product)).length,
      },
      {
        source: getNode("Alcoholic"),
        target: getNode("Beer"),
        value: productsSold.filter(({ tags }) => tags?.includes("beer")).length,
      },
      {
        source: getNode("Beer"),
        target: getNode("Tap"),
        value: productsSold.filter(
          ({ tags }) => tags?.includes("beer") && tags?.includes("tap"),
        ).length,
      },
      {
        source: getNode("Beer"),
        target: getNode("Non-Tap"),
        value: productsSold.filter(
          ({ tags }) => tags?.includes("beer") && !tags?.includes("tap"),
        ).length,
      },
      {
        source: getNode("Alcoholic"),
        target: getNode("Non-Beer"),
        value: productsSold.filter(
          ({ tags }) =>
            tags?.includes("cocktail") ||
            tags?.includes("spirit") ||
            tags?.includes("cider"),
        ).length,
      },
      {
        source: getNode("Non-Beer"),
        target: getNode("Cocktail"),
        value: productsSold.filter(({ tags }) => tags?.includes("cocktail"))
          .length,
      },
      {
        source: getNode("Non-Beer"),
        target: getNode("Non-Cocktail"),
        value: productsSold.filter(
          ({ tags }) =>
            !tags?.includes("cocktail") &&
            (tags?.includes("spirit") || tags?.includes("cider")),
        ).length,
      },
      {
        source: getNode(salesNode),
        target: getNode("Non-Alcoholic"),
        value: productsSold.filter((product) => !isAlcoholic(product)).length,
      },
      {
        source: getNode("Non-Alcoholic"),
        target: getNode("Mate"),
        value: productsSold.filter(
          (product) => !isAlcoholic(product) && isMate(product),
        ).length,
      },
      {
        source: getNode("Non-Alcoholic"),
        target: getNode("Non-Mate"),
        value: productsSold.filter(
          (product) => !isAlcoholic(product) && !isMate(product),
        ).length,
      },
    ]
      .map((link) => ({ ...link, value: link.value }))
      .filter(({ value }) => value >= 1);

    data[currentCamp.slug] = { links, nodes: Array.from(nodes) };
  }

  const now3 = new Date();

  console.log(
    `Sales.stats.SalesSankey: ${(now3.getTime() - now.getTime()) / 1000}s,(${
      (now2.getTime() - now.getTime()) / 1000
    }s fetch, ${(now3.getTime() - now2.getTime()) / 1000}s calc)`,
  );

  return { data };
}

const sparklineDays = 24;
async function calculateMenuDataForLocation(location: ILocation) {
  const currentDate = new Date();
  const from = subHours(currentDate, sparklineDays);
  const sales = await Sales.find({ timestamp: { $gte: from } }).fetchAsync();
  const products = await Products.find(
    {
      removedAt: { $exists: false },
      locationIds: { $elemMatch: { $eq: location._id } },
    },
    { sort: { brandName: 1, name: 1 } },
  ).fetchAsync();

  const productsGroupedByTags = Object.entries(
    groupBy(
      products.filter((product) =>
        location.curfew ? !isAlcoholic(product) : true,
      ),
      ({ tags }) =>
        [...(tags || emptyArray)].sort()?.join(",") ||
        //?.replace("beer,can", "beer")
        //?.replace("beer,bottle", "beer")
        //?.replace("beer,tap", "tap")
        //?.replace("bottle,soda", "soda")
        "other",
    ),
  );

  return productsGroupedByTags
    .sort((a, b) => a[0].localeCompare(b[0]))
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tags, products]) => {
      const productsByBrandName = Object.entries(
        groupBy(products, ({ brandName }) => brandName),
      )
        .sort(([, a], [, b]) => b.length - a.length)
        .map(
          ([brand, products]) =>
            [
              brand,
              products
                .sort((a, b) => a.name.localeCompare(b.name))
                .sort((a, b) => a.tap?.localeCompare(b.tap || "") || 0)
                .map(
                  (product) =>
                    [
                      product,
                      Array.from(
                        { length: sparklineDays },
                        (_, i) =>
                          [
                            sparklineDays - 1 - i,
                            sales.reduce((memo, sale) => {
                              if (
                                isWithinRange(
                                  sale.timestamp,
                                  addHours(currentDate, -i - 1),
                                  addHours(currentDate, -i),
                                )
                              ) {
                                return (
                                  memo +
                                  sale.products.filter(
                                    (saleProduct) =>
                                      saleProduct._id === product._id,
                                  ).length
                                );
                              }
                              return memo;
                            }, 0),
                          ] as const,
                      ),
                    ] as const,
                ),
            ] as const,
        )
        .sort(
          ([, aProducts], [, bProducts]) =>
            aProducts[0]?.[0].tap?.localeCompare(bProducts[0]?.[0].tap || "") ||
            0,
        );

      return [
        tags,
        productsByBrandName,
        Array.from(
          { length: sparklineDays },
          (_, i) =>
            [
              sparklineDays - 1 - i,
              sales.reduce((memo, sale) => {
                if (
                  isWithinRange(
                    sale.timestamp,
                    addHours(currentDate, -i - 1),
                    addHours(currentDate, -i),
                  )
                ) {
                  return (
                    memo +
                    sale.products.filter((saleProduct) =>
                      productsByBrandName
                        .map(([, products]) => products)
                        .flat()
                        .some(([product]) => saleProduct._id === product._id),
                    ).length
                  );
                }
                return memo;
              }, 0),
            ] as const,
        ),
      ] as const;
    });
}
async function calculateMenuData() {
  const now = new Date();
  const locations = await Locations.find({}).fetchAsync();
  const menuDataByLocation: Record<
    ILocation["slug"],
    Awaited<ReturnType<typeof calculateMenuDataForLocation>>
  > = {};
  const now2 = new Date();
  for (const location of locations) {
    menuDataByLocation[location.slug] = await calculateMenuDataForLocation(
      location,
    );
  }

  const now3 = new Date();

  console.log(
    `Products.menu.Menu: ${(now3.getTime() - now.getTime()) / 1000}s,(${
      (now2.getTime() - now.getTime()) / 1000
    }s fetch, ${(now3.getTime() - now2.getTime()) / 1000}s calc)`,
  );
  return menuDataByLocation;
}

Meteor.methods(salesMethods);

export default Sales;

//@ts-expect-error
if (Meteor.isClient) window.Sales = Sales;
