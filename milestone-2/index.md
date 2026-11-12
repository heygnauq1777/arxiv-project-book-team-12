# Milestone 2 — Hierarchical Parsing and Standardization

## Mục tiêu và đầu vào

[Mô tả corpus Milestone 1 được đưa vào parser, số bài và phiên bản.]

## Phương pháp

### Lần theo cấu trúc nhiều file

[Mô tả cách xác định file gốc có `\\documentclass`, theo `\\input`/`\\include` và bỏ qua file không thuộc luồng biên dịch.]

### Dựng cây phân cấp

[Mô tả các cấp document/section/subsection, danh sách và các nút lá sentence, block formula, figure/table; cách loại phần references và giữ acknowledgements/appendices.]

### Chuẩn hóa và trích BibTeX

[Mô tả cleanup LaTeX, chuẩn hóa inline/block math và chuyển `\\bibitem` thành BibTeX.]

### Khử trùng lặp qua phiên bản

[Mô tả cách hợp nhất reference entries và citation keys, cũng như deduplicate nội dung sau cleanup.]

## Kết quả

[Chèn thống kê parse success, version coverage, số elements và BibTeX trước/sau deduplication.]

## Hiệu năng

[Mô tả môi trường CPU-only trên Google Colab, thời gian end-to-end, thời gian trung bình mỗi publication, RAM tối đa và kích thước đầu ra.]

## Thảo luận và hạn chế

[Phân tích trường hợp parser chưa xử lý tốt và tác động lên dữ liệu.]

## Notebook phân tích

```{note}
Notebook `analysis.ipynb` sẽ được thêm khi pipeline và dữ liệu đầu ra sẵn sàng. Các bảng và hình trong báo cáo cần được tạo từ dữ liệu khi build book.
```
