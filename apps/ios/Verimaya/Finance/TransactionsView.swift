import SwiftUI

struct TransactionsView: View {
  @StateObject private var vm = TransactionsViewModel()
  @State private var showCreate = false
  @State private var editing: Transaction?

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(VerimayaTheme.danger)
        }

        summaryCard
          .padding(.horizontal, 16)
          .padding(.vertical, 12)

        if vm.transactions.isEmpty && !vm.isLoading {
          ContentUnavailableView(
            "Henüz işlem yok",
            systemImage: "turkishlirasign.circle",
            description: Text("Yeni işlem eklemek için + butonunu kullanın.")
          )
        } else {
          List {
            ForEach(vm.transactions) { tx in
              Button {
                editing = tx
              } label: {
                TransactionRow(transaction: tx)
              }
              .buttonStyle(.plain)
              .listRowBackground(VerimayaTheme.surface)
            }

            if vm.hasMore {
              HStack {
                Spacer()
                ProgressView()
                Spacer()
              }
              .listRowBackground(VerimayaTheme.bg)
              .onAppear {
                Task { await vm.loadMore() }
              }
            }
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .refreshable { await vm.refresh() }
        }
      }
    }
    .navigationTitle("Finans")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showCreate = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Yeni işlem")
      }
    }
    .sheet(isPresented: $showCreate) {
      TransactionFormView(mode: .create, vm: vm)
    }
    .sheet(item: $editing) { tx in
      TransactionFormView(mode: .edit(tx), vm: vm)
    }
    .task {
      await vm.load(reset: true)
    }
  }

  private var summaryCard: some View {
    HStack(spacing: 12) {
      summaryCell(
        label: "Gelir",
        value: Money.format(minor: vm.totalIncomeMinor),
        color: VerimayaTheme.success
      )
      summaryCell(
        label: "Gider",
        value: Money.format(minor: vm.totalExpenseMinor),
        color: VerimayaTheme.danger
      )
    }
    .padding(14)
    .frame(maxWidth: .infinity)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }

  private func summaryCell(label: String, value: String, color: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.caption)
        .foregroundStyle(VerimayaTheme.textMuted)
      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(color)
        .monospacedDigit()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct TransactionRow: View {
  let transaction: Transaction

  private var amountMinor: Int { transaction.amountBase ?? transaction.amount }
  private var amountText: String {
    let formatted = Money.format(minor: amountMinor, currency: transaction.currency.rawValue)
    return transaction.kind == .expense ? "-\(formatted)" : formatted
  }

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(transaction.title)
          .font(.body.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)
        HStack(spacing: 6) {
          Text(DateFmt.day(transaction.occurredOn))
            .font(.caption)
            .foregroundStyle(VerimayaTheme.textMuted)
          if let category = transaction.category, !category.isEmpty {
            Text("·")
              .foregroundStyle(VerimayaTheme.textFaint)
            Text(category)
              .font(.caption)
              .foregroundStyle(VerimayaTheme.textMuted)
          }
        }
      }
      Spacer(minLength: 8)
      VStack(alignment: .trailing, spacing: 6) {
        Text(amountText)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(transaction.kind == .income ? VerimayaTheme.success : VerimayaTheme.danger)
          .monospacedDigit()
        Text(transaction.status.label)
          .font(.caption.weight(.medium))
          .foregroundStyle(VerimayaTheme.text)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(VerimayaTheme.brandSubtle)
          .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      }
    }
    .padding(.vertical, 2)
  }
}
