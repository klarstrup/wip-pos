import { css } from "@emotion/css";
import { useFind } from "meteor/react-meteor-data";
import React, { ReactNode, useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import ReactSelect from "react-select";
import CreatableSelect from "react-select/creatable";
import Locations, { ILocation } from "../api/locations";
import Products, { IProduct } from "../api/products";
import BarcodeScannerComponent from "../components/BarcodeScanner";
import useCurrentLocation from "../hooks/useCurrentLocation";
import useMethod from "../hooks/useMethod";
import { units } from "../util";
import { Modal } from "./PageProducts";

const toOptions = (items: any[]) =>
  items.map((item) => ({ label: item, value: item }));

const Label = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode | ReactNode[];
}) => (
  <div
    className={css`
      display: flex;
      width: 480px;
      align-items: center;
      > div > input {
        width: 100%;
      }
    `}
  >
    <small
      className={css`
        flex: 0.33;
        text-align: right;
        margin-right: 4px;
      `}
    >
      {label}:
    </small>
    <div
      className={css`
        flex: 1;
        display: flex;
        > * {
          flex: 50%;
        }
      `}
    >
      {children}
    </div>
  </div>
);
export default function PageProductsItem({
  onCancel,
  product,
}: {
  onCancel: () => void;
  product?: IProduct;
}) {
  const locations = useFind(() => Locations.find(), []);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const { location } = useCurrentLocation();
  const [addProduct] = useMethod("Products.addProduct");
  const [editProduct] = useMethod("Products.editProduct");
  const products = useFind(() => Products.find(), []);
  const allTags = [
    ...products.reduce((memo, product) => {
      product.tags?.forEach((tag) => memo.add(tag.trim()));

      return memo;
    }, new Set<string>()),
  ].filter(Boolean);
  const allBrandNames = [
    ...products.reduce((memo, product) => {
      if (product.brandName) memo.add(product.brandName);

      return memo;
    }, new Set<string>()),
  ].filter(Boolean);

  const {
    handleSubmit,
    register,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
    setValue,
  } = useForm<Partial<IProduct> & { buyPrice: number }>();
  const onSubmit2 = async (data: Partial<IProduct> & { buyPrice: number }) => {
    if (!product) {
      await addProduct({ data: { ...data, tap: data.tap || null } });
    } else if (product) {
      await editProduct({
        productId: product._id,
        data: { ...data, tap: data.tap || null },
      });
    }
    onCancel?.();
    reset();
  };

  const handleBarCode = useCallback(
    (resultBarCode: string) => {
      setValue("barCode", resultBarCode);
      setScanningBarcode(false);
    },
    [setValue],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit2)}
      className={css`
        display: flex;
        flex-direction: column;
        align-content: center;
      `}
    >
      <Label label="Brand">
        <Controller
          name="brandName"
          control={control}
          rules={{ required: true }}
          defaultValue={product?.brandName || ""}
          render={({ field: { onBlur, value } }) => (
            <CreatableSelect
              required
              value={value ? { value, label: value } : null}
              isClearable
              options={toOptions(allBrandNames || [])}
              onBlur={onBlur}
              onChange={(option) =>
                setValue("brandName", option?.value || "", {
                  shouldDirty: true,
                })
              }
              className={css`
                color: black;
              `}
            />
          )}
        />
        {errors.brandName?.message}
      </Label>
      <Label label="Name">
        <input
          required
          type="text"
          defaultValue={product?.name || ""}
          {...register("name", { required: true })}
        />
      </Label>
      <Label label="Price">
        <input
          required
          type="number"
          defaultValue={product?.salePrice || ""}
          {...register("salePrice", { required: true })}
        />
      </Label>
      <Label label="Unit Size">
        <input
          required
          type="number"
          defaultValue={product?.unitSize || ""}
          {...register("unitSize")}
        />
        <Controller
          name="sizeUnit"
          control={control}
          defaultValue={product?.sizeUnit}
          render={({ field: { onBlur, value } }) => (
            <ReactSelect
              required
              value={value && { value: value, label: value }}
              options={units.map((code) => ({ value: code, label: code }))}
              onBlur={onBlur}
              onChange={(newValue) =>
                setValue("sizeUnit", newValue?.value, { shouldDirty: true })
              }
            />
          )}
        />
      </Label>
      <Label label="Alcohol %">
        <input
          type="number"
          step="any"
          defaultValue={product?.abv || ""}
          {...register("abv")}
        />
      </Label>
      <Label label="Description">
        <input
          type="text"
          defaultValue={product?.description || ""}
          {...register("description")}
        />
      </Label>
      <Label label="Bar Code">
        <div
          className={css`
            white-space: nowrap;
          `}
        >
          <button type="button" onClick={() => setScanningBarcode(true)}>
            Scan
          </button>
          <input
            type="text"
            defaultValue={product?.barCode || ""}
            {...register("barCode")}
          />
        </div>
        {scanningBarcode ? (
          <Modal onDismiss={() => setScanningBarcode(false)}>
            <BarcodeScannerComponent onResult={handleBarCode} />
          </Modal>
        ) : null}
      </Label>
      <Label label="Tap">
        <select defaultValue={product?.tap || ""} {...register("tap")}>
          <option value="">---</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </select>
      </Label>
      <Label label="Tags">
        <Controller
          name="tags"
          control={control}
          defaultValue={product?.tags}
          render={({ field: { onBlur, value } }) => (
            <CreatableSelect
              value={value ? toOptions(value) : null}
              options={toOptions(allTags || [])}
              isMulti
              onBlur={onBlur}
              className={css`
                color: black;
              `}
              onChange={(newValue) =>
                setValue("tags", newValue?.map(({ value }) => value) || [], {
                  shouldDirty: true,
                })
              }
            />
          )}
        />
      </Label>
      <Label label="Unit Cost">
        <input type="number" step="any" {...register("buyPrice")} />
        <small>
          <ul
            className={css`
              padding: 0;
              padding-left: 16px;
              margin: 0;
            `}
          >
            {Array.from(product?.shopPrices || [])
              .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
              .map(({ timestamp, buyPrice }) => (
                <li
                  key={String(timestamp)}
                >{`${buyPrice} kr. as of ${new Intl.DateTimeFormat("da-DK", {
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                  second: "numeric",
                }).format(timestamp)}`}</li>
              ))}
          </ul>
        </small>
      </Label>
      <hr />
      <div
        className={css`
          display: flex;
          justify-content: space-around;
        `}
      >
        <button
          disabled={!isDirty}
          type="submit"
          className={css`
            width: 200px;
          `}
        >
          {product ? "Update" : "Create"} {isSubmitting ? "..." : ""}
        </button>
        <button disabled={!isDirty} type="button" onClick={() => reset()}>
          Reset
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div>
        {product?.locationIds?.filter((id) => id !== location?._id).length ? (
          <small>
            <br />
            Product is on the menu at:{" "}
            {product?.locationIds
              ?.filter((id) => id !== location?._id)
              .map((id) => locations.find(({ _id }) => id === _id))
              .filter((location): location is ILocation => Boolean(location))
              .map(({ slug, name }) => <span key={slug}>{name}</span>)}
          </small>
        ) : null}
      </div>
    </form>
  );
}
