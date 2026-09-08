import SwiftUI

/// Finans — web panelindeki `/finance` mobil görünümü.
///
/// Düzen: "İşlemler" + "N işlem" · AI ile işlem düğmesi · bakiye kartı
/// (Borç / Alacak + Detay) · arama · tür ve durum filtreleri + "+" · kart listesi.
struct TransactionsView: View {
  @ObservedObject var period: PanelPeriod
  /// Web'de bu düğme AI ile İşlem sayfasına gider; kabuk sekmeyi değiştirir.
  var onOpenAI: () -> Void = {}

  @StateObject private var vm = TransactionsViewModel()
  @State private var showCreate = false
  @State private var editing: Transaction?
  @State private var searchTask: Task<Void, Never>?

  /// Süzgeçler sunucuda uygulanıyor; liste doğrudan gösterilir.
  private var rows: [Transaction] { vm.transactions }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.danger)
        }

        PageTitle("İşlemler", subtitle: "\(rows.count) işlem") {
          OutlineButton(
            title: "AI ile işlem",
            systemImage: "sparkles",
            badge: vm.pendingInboxCount > 0 ? "\(vm.pendingInboxCount)" : nil
          ) {
            onOpenAI()
          }
        }

        BalanceCard(
          debtMinor: vm.totalExpenseMinor,
          creditMinor: vm.totalIncomeMinor
        )

        searchField

        HStack(spacing: 8) {
          SelectField(
            title: "Tüm türler",
            selection: $vm.kind,
            options: [(value: "", label: "Tüm türler")]
              + TransactionKind.allCases.map { (value: $0.rawValue, label: $0.label) }
          )
          SelectField(
            title: "Tüm durumlar",
            selection: $vm.status,
            options: [(value: "", label: "Tüm durumlar")]
              + TransactionStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
          )
          AddSquareButton { showCreate = true }
        }

        Divider().overlay(VerimayaTheme.border)

        if rows.isEmpty && !vm.isLoading {
          Text("Henüz işlem yok.")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 40)
        } else {
          LazyVStack(spacing: 10) {
            ForEach(rows) { tx in
              TransactionCard(transaction: tx) { editing = tx }
            }
            if vm.hasMore {
              ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .onAppear { Task { await vm.loadMore() } }
            }
          }
        }
      }
      .padding(VerimayaUI.pagePadding)
      .padding(.bottom, 72)
    }
    .background(VerimayaTheme.bg)
    .refreshable { await vm.refresh() }
    .sheet(isPresented: $showCreate) { TransactionFormView(mode: .create, vm: vm) }
    .sheet(item: $editing) { tx in TransactionFormView(mode: .edit(tx), vm: vm) }
    .task {
      applyPeriod()
      await vm.load(reset: true)
      await vm.loadPendingInboxCount()
    }
    // Dönem ve süzgeç değişince sunucuya yeniden sorulur.
    .onChange(of: period.month) { _, _ in
      applyPeriod()
      Task { await vm.load(reset: true) }
    }
    .onChange(of: vm.kind) { _, _ in Task { await vm.load(reset: true) } }
    .onChange(of: vm.status) { _, _ in Task { await vm.load(reset: true) } }
    .onChange(of: vm.search) { _, _ in
      searchTask?.cancel()
      searchTask = Task {
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        await vm.load(reset: true)
      }
    }
  }

  private func applyPeriod() {
    vm.from = period.from
    vm.to = period.to
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      TextField("Başlık, kategori, hasta, kişi…", text: $vm.search)
        .font(.subheadline)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
    }
    .padding(.horizontal, 12)
    .frame(height: VerimayaUI.controlHeight)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }
}

/// Borç / Alacak kartı — web'de tek satır, sağda "Detay ›".
private struct BalanceCard: View {
  let debtMinor: Int
  let creditMinor: Int

  var body: some View {
    PanelCard(padding: 14) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Borç: \(Money.format(minor: debtMinor))")
            .foregroundStyle(VerimayaTheme.text)
          Text("Alacak: \(Money.format(minor: creditMinor))")
            .foregroundStyle(VerimayaTheme.success)
        }
        .font(.subheadline)
        .monospacedDigit()

        Spacer(minLength: 8)

        HStack(spacing: 2) {
          Text("Detay")
          Image(systemName: "chevron.right").font(.caption.weight(.semibold))
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(VerimayaTheme.brand)
      }
    }
  }
}

/// İşlem kartı: başlık · tarih · durum rozeti, sağda tutar.
/// Gider tutarı eksi işaretiyle ve nötr renkte, gelir yeşil — web ile aynı.
private struct TransactionCard: View {
  let transaction: Transaction
  let onEdit: () -> Void

  private var amountText: String {
    let minor = transaction.amountBase ?? transaction.amount
    let currency = (transaction.baseCurrency ?? transaction.currency).rawValue
    let formatted = Money.format(minor: minor, currency: currency)
    return transaction.kind == .expense ? "−\(formatted)" : formatted
  }

  private var statusTone: Chip.Tone {
    switch transaction.status {
    case .paid: .success
    case .partial: .warning
    case .unpaid: .danger
    }
  }

  var body: some View {
    Button(action: onEdit) {
      PanelCard {
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(transaction.title)
              .font(.body.weight(.medium))
              .foregroundStyle(VerimayaTheme.text)
              .lineLimit(1)
            Spacer(minLength: 8)
            Text(amountText)
              .font(.body.weight(.semibold))
              .foregroundStyle(
                transaction.kind == .income ? VerimayaTheme.success : VerimayaTheme.text
              )
              .monospacedDigit()
              .lineLimit(1)
          }

          Text(DateFmt.day(transaction.occurredOn))
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)

          Chip(text: transaction.status.label, tone: statusTone)
        }
      }
    }
    .buttonStyle(.plain)
  }
}
